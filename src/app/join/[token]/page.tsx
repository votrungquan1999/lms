import { getCourseService } from "src/lib/services-singleton";
import { InvalidInviteCard, ValidInviteCard } from "./join-page.ui";

export const metadata = {
  title: "Join a Course — LMS",
  description: "Accept a course invite link",
};

// Revocation must take effect on the next request — a cached render would
// keep serving a switched-off invite.
export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const courseService = await getCourseService();
  const course = await courseService.findByInviteToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {course ? (
        <ValidInviteCard title={course.title} />
      ) : (
        <InvalidInviteCard />
      )}
    </main>
  );
}
