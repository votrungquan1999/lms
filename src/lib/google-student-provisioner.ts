import type { CourseJoinRequestService } from "./course-join-request-service";
import type { SchoolDirectory } from "./school-directory";
import {
  DuplicateAuthAccountError,
  DuplicateUsernameError,
  type StudentService,
} from "./student-service";
import { USERNAME_PATTERN } from "./username";

/**
 * Dependencies the Google-join provisioner needs, injected for testability —
 * the OAuth round trip that produces its input cannot be driven from Vitest,
 * but this function can be exercised directly against a real test database
 * exactly like every other service here.
 */
export interface GoogleStudentProvisionDeps {
  /** Bound to the invite course's school, which the new student joins. */
  studentService: StudentService;
  schoolDirectory: SchoolDirectory;
  /** Bound to the same school as `studentService`. */
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
 * The outcomes of a Google join attempt. A colliding or unusable
 * derived username is never refused outright (D49) — the person keeps their
 * Google session and picks their own username instead.
 */
export enum GoogleProvisionOutcome {
  Provisioned = "provisioned",
  NeedsUsername = "needs-username",
  /** The sign-in account already has a profile in a different school. */
  WrongSchool = "wrong-school",
}

/**
 * Derives a username from a Google email's local-part: lowercased and
 * stripped to the self-signup charset (D3/D45) so both paths' usernames
 * always agree with what SchoolDirectory.findByUsername can find. Exported so
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
 * The outcome when the sign-in account already has a profile: re-entry into
 * the same school is a no-op, but a profile in another school must not be
 * reported as waiting for approval here — no request exists for this school.
 */
function outcomeForExistingProfile(
  profile: { schoolId: string | null },
  inviteSchoolId: string,
): GoogleProvisionOutcome {
  return profile.schoolId === inviteSchoolId
    ? GoogleProvisionOutcome.Provisioned
    : GoogleProvisionOutcome.WrongSchool;
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
  // Collapses the common re-entry (a reload or second tab after the first
  // write landed) to a no-op. A truly concurrent one passes this read and is
  // caught below, where a clash is re-checked against this same account.
  const schoolId = deps.studentService.schoolId;
  const already = await deps.schoolDirectory.findByAuthUserId(input.authUserId);
  if (already) {
    return outcomeForExistingProfile(already, schoolId);
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
  const existing = await deps.schoolDirectory.findByUsername(username);
  if (existing) {
    // A second render (reload, second tab) can land here even though its
    // OWN "already provisioned?" read above was stale — the write it raced
    // against already landed. Re-checking by authUserId tells that self-
    // collision apart from someone else's real username clash.
    const ownProfile = await deps.schoolDirectory.findByAuthUserId(
      input.authUserId,
    );
    return ownProfile
      ? outcomeForExistingProfile(ownProfile, schoolId)
      : GoogleProvisionOutcome.NeedsUsername;
  }

  let student: Awaited<
    ReturnType<typeof deps.studentService.createStudentDocument>
  >;
  try {
    student = await deps.studentService.createStudentDocument({
      authUserId: input.authUserId,
      username,
      name: input.name,
      createdBy: "google-signup",
    });
  } catch (error) {
    // A truly concurrent second render can pass BOTH checks above before
    // either write lands — the create then refuses the loser as a duplicate
    // username or sign-in account. Re-reading by authUserId tells a
    // self-collision apart from a real clash, the same way as above.
    if (
      !(error instanceof DuplicateUsernameError) &&
      !(error instanceof DuplicateAuthAccountError)
    ) {
      throw error;
    }
    const ownProfile = await deps.schoolDirectory.findByAuthUserId(
      input.authUserId,
    );
    return ownProfile
      ? outcomeForExistingProfile(ownProfile, schoolId)
      : GoogleProvisionOutcome.NeedsUsername;
  }

  await deps.courseJoinRequestService.createRequest({
    courseId: input.courseId,
    studentId: student.id,
  });

  return GoogleProvisionOutcome.Provisioned;
}
