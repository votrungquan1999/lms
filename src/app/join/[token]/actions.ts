"use server";

import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getCourseJoinRequestService,
  getCourseService,
} from "src/lib/services-singleton";
import { z } from "zod";

const joinSignupSchema = z.object({
  token: z.string().min(1, "Invalid invite link"),
  name: z.string().trim().min(1, "Name is required"),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export interface JoinSignupState {
  success: boolean;
  message: string;
}

const INVALID_INVITE_MESSAGE =
  "This join link is no longer valid. Ask whoever shared it with you for a new one.";

/**
 * Server action: lets a prospective student create their own account from an
 * invite link. Deliberately has NO auth guard — the caller has no account by
 * definition. Safety instead comes from re-resolving the course from the
 * token server-side (never trusting a client-supplied courseId, per D41) and
 * from `registerStudent`'s existing role default (self-registrants can never
 * request a role — D15's `input: false`).
 */
export async function joinSignupAction(
  _prevState: JoinSignupState | null,
  formData: FormData,
): Promise<JoinSignupState> {
  const parsed = joinSignupSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.joinSignupAction",
      { "lms.action.name": "joinSignupAction" }, // never the token itself (D41)
      async () => {
        const courseService = await getCourseService();
        const course = await courseService.findByInviteToken(parsed.data.token);
        if (!course) {
          return { success: false, message: INVALID_INVITE_MESSAGE };
        }

        const authService = await getAuthService();
        const student = await authService.registerStudent({
          name: parsed.data.name,
          username: parsed.data.username,
          password: parsed.data.password,
          createdBy: "self-signup",
        });

        // Write order: account first, join request second (§6/§20) — a
        // crash here leaves a person who can sign in but has no way to
        // re-request from this link today (revisiting collides on their own
        // username and the join page has no signed-in path). Step 25 owns
        // the fix; until then this is a dead-end loop, not a resolvable one.
        const joinRequestService = await getCourseJoinRequestService();
        await joinRequestService.createRequest({
          courseId: course.id,
          studentId: student.id,
        });

        return {
          success: true,
          message: `Account created. Your request to join "${course.title}" is now waiting for admin approval.`,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to create your account";
    return { success: false, message };
  }
}
