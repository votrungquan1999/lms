import { StudentLoginForm } from "./student-login-form";

export const metadata = {
  title: "Student Login — LMS",
  description: "Sign in with your credentials to access courses and lessons",
};

export default function StudentLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <StudentLoginForm />
    </main>
  );
}
