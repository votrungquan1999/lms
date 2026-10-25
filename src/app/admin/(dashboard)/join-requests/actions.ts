"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getCourseJoinRequestService,
  getEnrollmentService,
  getSchoolDirectory,
  getStudentService,
} from "src/lib/services-singleton";
import { z } from "zod";

const requestIdSchema = z.object({
  requestId: z.string().trim().min(1, "requestId is required"),
});

export interface JoinRequestActionState {
  success: boolean;
  message: string;
}

/**
 * Server action: approves a pending join request. The status is claimed
 * first, then this school is added to the student's schools, then the student
 * is enrolled — so a losing concurrent Reject is refused before the student
 * is added or enrolled. Every write is safe to repeat: a crash part-way leaves
 * the request Approved, and a retried approve re-claims it and finishes the
 * rest.
 */
export async function approveJoinRequestAction(
  _prevState: JoinRequestActionState | null,
  formData: FormData,
): Promise<JoinRequestActionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  // Re-checks admin access itself — a server action is a separate POST
  // endpoint the (dashboard) layout guard never runs in front of.
  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = requestIdSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.approveJoinRequestAction",
      {
        "lms.action.name": "approveJoinRequestAction",
        "lms.request.id": parsed.data.requestId,
        "lms.admin.id": adminUserId,
      },
      async () => {
        const joinRequestService = await getCourseJoinRequestService(schoolId);
        const request = await joinRequestService.getRequest(
          parsed.data.requestId,
        );
        if (!request) {
          return { success: false, message: "Join request not found" };
        }

        // Refused before the claim: a missing student after it would leave
        // the request approved but nobody added or enrolled.
        const schoolDirectory = await getSchoolDirectory();
        const [existing] = await schoolDirectory.findStudentsByIds([
          request.studentId,
        ]);
        if (!existing) {
          return { success: false, message: "Student not found" };
        }

        // The atomic claim throws here for a Rejected row, or for a losing
        // concurrent Reject.
        await joinRequestService.approve(request.id, adminUserId);

        // Enrolment only accepts this school's students, so the school is
        // added first; every step is safe to repeat on a retried approval.
        const studentService = await getStudentService(schoolId);
        if (!(await studentService.addToSchool(request.studentId))) {
          return { success: false, message: "Student not found" };
        }

        const enrollmentService = await getEnrollmentService(schoolId);
        await enrollmentService.enrollStudent(
          request.courseId,
          request.studentId,
          adminUserId,
        );

        revalidatePath("/admin/join-requests");
        return { success: true, message: "Request approved." };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to approve request";
    return { success: false, message };
  }
}

/**
 * Server action: rejects a pending join request. Status-only — an
 * enrollment the student already has by another path is left untouched, and
 * the account they created is not deleted or deactivated.
 */
export async function rejectJoinRequestAction(
  _prevState: JoinRequestActionState | null,
  formData: FormData,
): Promise<JoinRequestActionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  // Re-checks admin access itself — a server action is a separate POST
  // endpoint the (dashboard) layout guard never runs in front of.
  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = requestIdSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.rejectJoinRequestAction",
      {
        "lms.action.name": "rejectJoinRequestAction",
        "lms.request.id": parsed.data.requestId,
        "lms.admin.id": adminUserId,
      },
      async () => {
        const joinRequestService = await getCourseJoinRequestService(schoolId);
        const request = await joinRequestService.getRequest(
          parsed.data.requestId,
        );
        if (!request) {
          return { success: false, message: "Join request not found" };
        }

        // The atomic claim throws for a non-Pending row.
        await joinRequestService.reject(request.id, adminUserId);

        revalidatePath("/admin/join-requests");
        return { success: true, message: "Request rejected." };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to reject request";
    return { success: false, message };
  }
}
