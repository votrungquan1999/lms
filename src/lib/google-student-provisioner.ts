import type { CourseJoinRequestService } from "./course-join-request-service";
import type { StudentService } from "./student-service";
import { USERNAME_PATTERN } from "./username";

/**
 * Dependencies the Google-join provisioner needs, injected for testability —
 * the OAuth round trip that produces its input cannot be driven from Vitest,
 * but this function can be exercised directly against a real test database
 * exactly like every other service here.
 */
export interface GoogleStudentProvisionDeps {
  studentService: StudentService;
  courseJoinRequestService: CourseJoinRequestService;
}

/** The raw Google identity plus the course the invite link named. */
export interface GoogleStudentProvisionInput {
  authUserId: string;
  email: string;
  name: string;
  courseId: string;
}

/**
 * The two outcomes of a Google join attempt. A colliding or unusable
 * derived username is never refused outright (D49) — the person keeps their
 * Google session and picks their own username instead.
 */
export enum GoogleProvisionOutcome {
  Provisioned = "provisioned",
  NeedsUsername = "needs-username",
}

/**
 * Derives a username from a Google email's local-part: lowercased and
 * stripped to the self-signup charset (D3/D45) so both paths' usernames
 * always agree with what StudentService.findByUsername can find. Exported so
 * the invite page can compute the same value as a pre-filled suggestion when
 * the outcome is NeedsUsername (D49) — this can yield a too-short or even
 * empty string (e.g. a non-ASCII local part), which is exactly why the
 * caller must validate it rather than trust it directly.
 */
export function deriveUsername(email: string): string {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  return localPart.replace(/[^a-z0-9._+-]/g, "").slice(0, 32);
}

/**
 * Provisions a student account for a Google signup that landed on an invite
 * link, or reports that the derived username needs the person's own choice.
 * The invite-origin guard (open question 3, D19) is enforced by the CALLER,
 * not here: this only ever runs once the `/join/[token]` page has confirmed
 * the caller is authenticated but not yet classified — an admin or an
 * existing student never reaches this function (see
 * `AuthService.resolveUnclassifiedIdentity`).
 */
export async function provisionGoogleStudent(
  deps: GoogleStudentProvisionDeps,
  input: GoogleStudentProvisionInput,
): Promise<GoogleProvisionOutcome> {
  // M2: this function is not otherwise idempotent — two concurrent tabs (or
  // a reload) can both pass the checks below before either write lands. This
  // does not close that race, but it does collapse the common case (the
  // SAME identity re-entering sequentially) to a no-op instead of the
  // identity finding its own just-created username "taken".
  const already = await deps.studentService.findByAuthUserId(input.authUserId);
  if (already) {
    return GoogleProvisionOutcome.Provisioned;
  }

  const username = deriveUsername(input.email);

  // D49: an invalid derivation (too short, or empty for a non-ASCII local
  // part) or a collision with a DIFFERENT person's username both fall back
  // to letting this person choose their own — never a refusal, and never an
  // auto-suffix (that would reverse D3). There is no auth user to roll back
  // on this path: the person keeps their Google session and completes a
  // profile against the SAME authUserId next.
  if (!USERNAME_PATTERN.test(username)) {
    return GoogleProvisionOutcome.NeedsUsername;
  }
  const existing = await deps.studentService.findByUsername(username);
  if (existing) {
    return GoogleProvisionOutcome.NeedsUsername;
  }

  const student = await deps.studentService.createStudentDocument({
    authUserId: input.authUserId,
    username,
    name: input.name,
    createdBy: "google-signup",
  });

  await deps.courseJoinRequestService.createRequest({
    courseId: input.courseId,
    studentId: student.id,
  });

  return GoogleProvisionOutcome.Provisioned;
}
