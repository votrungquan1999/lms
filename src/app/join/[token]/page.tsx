import { headers } from "next/headers";
import Link from "next/link";
import { OrDivider, SignInShell } from "src/components/sign-in-card";
import { getAuthService } from "src/lib/auth-singleton";
import {
  deriveUsername,
  GoogleProvisionOutcome,
  provisionGoogleStudent,
} from "src/lib/google-student-provisioner";
import {
  getCourseJoinRequestService,
  getSchoolDirectory,
  getStudentService,
} from "src/lib/services-singleton";
import { isStudentSession } from "src/lib/session";
import { GoogleJoinButton } from "./google-join-button";
import { GoogleUsernameForm } from "./google-username-form";
import {
  HeaderSignInLink,
  InvalidInviteCard,
  JoinStateCard,
  ValidInviteCard,
} from "./join-page.ui";
import { RequestToJoinForm } from "./request-to-join-form";
import { SelfSignupForm } from "./self-signup-form";

export const metadata = {
  title: "Join a Course — LMS",
  description: "Accept a course invite link",
};

// Revocation must take effect on the next request — a cached render would
// keep serving a switched-off invite.
export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;

  // No session here, so the course's school comes from the platform-wide
  // directory; a course with no school yet is an invalid invite.
  const schoolDirectory = await getSchoolDirectory();
  const invite = await schoolDirectory.findAssignedInviteCourse(token);

  if (!invite) {
    return (
      <SignInShell>
        <InvalidInviteCard />
      </SignInShell>
    );
  }
  const { course, schoolId } = invite;

  const authService = await getAuthService();
  const requestHeaders = await headers();

  // Step 25: a student who ALREADY has an account (e.g. one whose
  // self-registration crashed after the account write but before the
  // join-request write — D47) gets a signed-in path to ask in, instead of
  // being shown a registration form for a username that's already taken. An
  // admin session falls through unaffected — this only branches on a
  // recorded STUDENT.
  const session = await authService.getSession(requestHeaders);
  if (session && isStudentSession(session)) {
    // The session carries no display name, so read it from the student record.
    const student = await schoolDirectory.findByUsername(session.username);
    return (
      <SignInShell>
        <RequestToJoinForm
          token={token}
          courseTitle={course.title}
          name={student?.name ?? session.username}
          username={session.username}
        />
      </SignInShell>
    );
  }

  // M1: opening this link alone must never write anything — reachable with
  // no click at all (tab restore, back/forward, a URL handler, a future
  // prefetching <Link>). The ?google=1 marker GoogleJoinButton sets is the
  // caller's actual gesture; this is a consent signal, not a security
  // boundary — resolveUnclassifiedIdentity's own admin/student exclusion is
  // what keeps an already-classified caller safe either way.
  const { google } = await searchParams;
  const isGoogleCallback = google === "1";

  let googleOutcome: GoogleProvisionOutcome | null = null;
  let suggestedUsername = "";
  if (isGoogleCallback) {
    // A caller who just completed a Google OAuth round trip lands back here
    // (Step 22) holding a valid cookie that resolves to no usable role yet —
    // provisioning them now, inside this same render, is what keeps
    // getSession() from ever surfacing that half-classified state to the
    // browser (see the assignment's half-authenticated-caller note). An
    // already signed-in admin or student never reaches this branch at all.
    const googleIdentity =
      await authService.resolveUnclassifiedIdentity(requestHeaders);

    if (googleIdentity) {
      const [studentService, courseJoinRequestService] = await Promise.all([
        getStudentService(schoolId),
        getCourseJoinRequestService(schoolId),
      ]);
      googleOutcome = await provisionGoogleStudent(
        { studentService, schoolDirectory, courseJoinRequestService },
        { ...googleIdentity, courseId: course.id },
      );
      if (googleOutcome === GoogleProvisionOutcome.NeedsUsername) {
        // D49: pre-fill with the sanitised candidate where one exists — this
        // can be empty (a non-ASCII local part), in which case the field is
        // left blank rather than pre-filled with nothing meaningful.
        suggestedUsername = deriveUsername(googleIdentity.email);
      }
    }
  }

  // Back from Google the caller holds a session, so no header Sign in link.
  if (googleOutcome === GoogleProvisionOutcome.NeedsUsername) {
    return (
      <SignInShell>
        <JoinStateCard>
          <GoogleUsernameForm
            token={token}
            suggestedUsername={suggestedUsername}
          />
        </JoinStateCard>
      </SignInShell>
    );
  }

  if (googleOutcome === GoogleProvisionOutcome.Provisioned) {
    return (
      <SignInShell>
        <ValidInviteCard title={course.title}>
          <output className="block text-sm text-muted-foreground">
            Signed in with Google. Your request to join &quot;{course.title}
            &quot; is now waiting for admin approval.{" "}
            <a href="/student/dashboard" className="underline">
              Go to your dashboard
            </a>
            .
          </output>
        </ValidInviteCard>
      </SignInShell>
    );
  }

  return (
    <SignInShell headerRight={<HeaderSignInLink />}>
      <ValidInviteCard
        title={course.title}
        subtitle="Create an account to ask to join."
      >
        <div className="space-y-4">
          <SelfSignupForm token={token} />
          <OrDivider />
          <GoogleJoinButton token={token} />
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/student/login" className="text-primary underline">
              Sign in
            </Link>
            ,<br />
            then open this link again.
          </p>
        </div>
      </ValidInviteCard>
    </SignInShell>
  );
}
