"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getCourseJoinRequestService,
  getEnrollmentService,
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
 * Server action: approves a pending join request, enrolling the student
 * (Step 30). The status is claimed FIRST, the enrollment written SECOND
 * (D90/R6) — so a losing concurrent Reject is refused before an enrollment
 * for the turned-down student ever exists. A crash between the two writes
 * leaves "approved but not enrolled," which a retried approve safely
 * finishes: re-claiming an already-Approved row succeeds and re-runs the
 * (idempotent) enrollment instead of throwing.
 */
export async function approveJoinRequestAction(
  _prevState: JoinRequestActionState | null,
  formData: FormData,
): Promise<JoinRequestActionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  // Re-checks admin access itself — a server action is a separate POST
  // endpoint the (dashboard) layout guard never runs in front of (R5).
  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
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
        const joinRequestService = await getCourseJoinRequestService();
        const request = await joinRequestService.getRequest(
          parsed.data.requestId,
        );
        if (!request) {
          return { success: false, message: "Join request not found" };
        }

        // Claim the status BEFORE enrolling (D90/R6) — the atomic claim
        // throws here for a Rejected row, or for a losing concurrent Reject.
        await joinRequestService.approve(request.id, adminUserId);

        const enrollmentService = await getEnrollmentService();
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
 * Server action: rejects a pending join request (Step 31). Status-only — an
 * enrollment the student already has by another path is left untouched
 * (D66/R7); there is no delete/deactivate path for the account they created
 * (D11).
 */
export async function rejectJoinRequestAction(
  _prevState: JoinRequestActionState | null,
  formData: FormData,
): Promise<JoinRequestActionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  // Re-checks admin access itself — a server action is a separate POST
  // endpoint the (dashboard) layout guard never runs in front of (R5).
  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
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
        const joinRequestService = await getCourseJoinRequestService();
        const request = await joinRequestService.getRequest(
          parsed.data.requestId,
        );
        if (!request) {
          return { success: false, message: "Join request not found" };
        }

        // The atomic claim (Step 32/R6) throws for a non-Pending row.
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
