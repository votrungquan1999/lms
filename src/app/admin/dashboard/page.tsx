import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthService } from "src/lib/auth-singleton";
import type { AdminSession } from "src/lib/session";
import { CreateStudentForm } from "./create-student-form";

export const metadata = {
  title: "Admin Dashboard — LMS",
  description: "Manage student accounts and course content",
};

export default async function AdminDashboardPage() {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminSession: AdminSession;
  try {
    adminSession = await authService.requireAdminSession(requestHeaders);
  } catch {
    redirect("/admin/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {adminSession.email}
        </p>
      </header>

      <section className="w-full max-w-md">
        <CreateStudentForm />
      </section>
    </main>
  );
}
