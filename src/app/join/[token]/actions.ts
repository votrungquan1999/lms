"use server";

import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getCourseJoinRequestService,
  getCourseService,
  getEnrollmentService,
  getStudentService,
} from "src/lib/services-singleton";
import { USERNAME_PATTERN } from "src/lib/username";
import { z } from "zod";

const joinSignupSchema = z.object({
  token: z.string().min(1, "Invalid invite link"),
  name: z.string().trim().min(1, "Name is required"),
  // Lowercased before the charset check (not after) so "Alice" is accepted
  // and stored as "alice" — matching what AuthService.registerStudent does
  // internally (D45) — rather than rejected as if uppercase were forbidden.
  // The charset/length bound itself keeps a malformed username from ever
  // reaching better-auth's own email validator, which would otherwise
  // surface its raw error (and the internal @lms.internal scheme) to a
  // visitor filling out a form with no email field.
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      USERNAME_PATTERN,
      "Username may use letters, numbers, dots, dashes and underscores",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

// D49: no password field — the caller already holds a valid Google session,
// they are only picking a username the derived one couldn't use.
const googleUsernameSchema = z.object({
  token: z.string().min(1, "Invalid invite link"),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      USERNAME_PATTERN,
      "Username may use letters, numbers, dots, dashes and underscores",
    ),
});

export interface JoinSignupState {
  success: boolean;
  message: string;
}

export interface GoogleUsernameSignupState {
  success: boolean;
  message: string;
}

export interface RequestToJoinState {
  success: boolean;
  message: string;
}

const requestToJoinSchema = z.object({
  token: z.string().min(1, "Invalid invite link"),
});

const INVALID_INVITE_MESSAGE =
  "This join link is no longer valid. Ask whoever shared it with you for a new one.";

// D3: a duplicate identity is BLOCKED, never linked or auto-suffixed. The
// generic "Username already exists" registerStudent throws (shared with the
// admin-facing create/bulk-import forms) reads as "pick another one" — wrong
// here, since this is an identity collision, not a naming conflict.
const USERNAME_TAKEN_MESSAGE =
  "This username already belongs to an account. Please sign in with your original method instead.";

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
        let student: Awaited<ReturnType<typeof authService.registerStudent>>;
        try {
          student = await authService.registerStudent({
            name: parsed.data.name,
            username: parsed.data.username,
            password: parsed.data.password,
            createdBy: "self-signup",
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "Username already exists"
          ) {
            return { success: false, message: USERNAME_TAKEN_MESSAGE };
          }
          throw error;
        }

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

/**
 * Server action: lets a Google signup whose derived username was taken or
 * invalid (D49) finish joining with a username they choose themselves.
 * Re-resolves the caller's identity server-side via the SAME session cookie
 * (never a client-supplied authUserId, mirroring D41's courseId rule) and
 * binds the new student document to that existing authUserId — no new auth
 * user is created here, so there is nothing to roll back on failure.
 */
export async function googleUsernameSignupAction(
  _prevState: GoogleUsernameSignupState | null,
  formData: FormData,
): Promise<GoogleUsernameSignupState> {
  const parsed = googleUsernameSchema.safeParse({
    token: formData.get("token"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.googleUsernameSignupAction",
      { "lms.action.name": "googleUsernameSignupAction" },
      async () => {
        const courseService = await getCourseService();
        const course = await courseService.findByInviteToken(parsed.data.token);
        if (!course) {
          return { success: false, message: INVALID_INVITE_MESSAGE };
        }

        const authService = await getAuthService();
        const googleIdentity = await authService.resolveUnclassifiedIdentity(
          await headers(),
        );
        if (!googleIdentity) {
          return {
            success: false,
            message: "Your Google sign-in has expired. Please sign in again.",
          };
        }

        const studentService = await getStudentService();
        let student: Awaited<
          ReturnType<typeof studentService.createStudentDocument>
        >;
        try {
          student = await studentService.createStudentDocument({
            authUserId: googleIdentity.authUserId,
            username: parsed.data.username,
            name: googleIdentity.name,
            createdBy: "google-signup",
          });
        } catch (error) {
          // Unlike D3's identity-collision message, this is a plain naming
          // conflict on a username the person picked themselves — "sign in
          // with your original method" would make no sense here, since
          // there is no other method for a brand-new Google signup.
          if (
            error instanceof Error &&
            error.message === "Username already exists"
          ) {
            return {
              success: false,
              message: "That username is already taken. Please choose another.",
            };
          }
          throw error;
        }

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

/**
 * Server action: lets an EXISTING, signed-in student ask to join a course
 * from its invite link — the recovery path D47 calls a hard prerequisite for
 * shipping this feature (a self-registration that crashed after the account
 * write but before the join-request write otherwise has no way back in).
 * Guarded on a STUDENT session, following the canonical 8-step skeleton at
 * `courses/actions.ts:23-69` with the guard swapped for a student's own.
 */
export async function requestToJoinAction(
  _prevState: RequestToJoinState | null,
  formData: FormData,
): Promise<RequestToJoinState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let studentId: string;
  try {
    const session = await authService.requireStudentSession(requestHeaders);
    studentId = session.studentId;
  } catch {
    return { success: false, message: "Unauthorized: student access required" };
  }

  const parsed = requestToJoinSchema.safeParse({
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.requestToJoinAction",
      { "lms.action.name": "requestToJoinAction" }, // never the token itself (D41)
      async () => {
        const courseService = await getCourseService();
        const course = await courseService.findByInviteToken(parsed.data.token);
        if (!course) {
          return { success: false, message: INVALID_INVITE_MESSAGE };
        }

        // Existence-equals-membership (enrollment-service.ts) — an enrolled
        // student is told so directly, never handed a second pending request.
        const enrollmentService = await getEnrollmentService();
        const alreadyEnrolled = await enrollmentService.isEnrolled(
          course.id,
          studentId,
        );
        if (alreadyEnrolled) {
          return {
            success: true,
            message: `You're already enrolled in "${course.title}".`,
          };
        }

        // Pre-checked so the reply can say "already waiting" instead of the
        // generic success message — this is for the MESSAGE only.
        // createRequest has no unique index, so a lost race here can still
        // insert a second Pending row.
        const joinRequestService = await getCourseJoinRequestService();
        const existingPending = await joinRequestService.getPendingRequest(
          course.id,
          studentId,
        );
        if (existingPending) {
          return {
            success: true,
            message: `Your request to join "${course.title}" is already waiting for admin approval.`,
          };
        }

        await joinRequestService.createRequest({
          courseId: course.id,
          studentId,
        });

        return {
          success: true,
          message: `Your request to join "${course.title}" is now waiting for admin approval.`,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to submit your request";
    return { success: false, message };
  }
}
