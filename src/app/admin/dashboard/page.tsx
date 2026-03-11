import Link from "next/link";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import { getPageGuard } from "src/lib/services-singleton";
import { CreateStudentForm } from "./create-student-form";

export const metadata = {
  title: "Admin Dashboard — LMS",
  description: "Manage student accounts and course content",
};

export default async function AdminDashboardPage() {
  const guard = await getPageGuard();
  const adminSession = await guard.requireAdminLogin();

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {adminSession.email}
        </p>
      </header>

      <nav className="mb-8 w-full max-w-md">
        <Link href="/admin/courses" className="block">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="text-lg">Manage Courses →</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </nav>

      <section className="w-full max-w-md">
        <CreateStudentForm />
      </section>
    </main>
  );
}
