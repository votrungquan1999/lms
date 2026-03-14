import { getPageGuard } from "src/lib/services-singleton";
import { StudentHeader } from "../student-header";

export default async function StudentDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const guard = await getPageGuard();
  const session = await guard.requireStudentLogin();

  return (
    <div className="flex min-h-screen flex-col">
      <StudentHeader username={session.username} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
