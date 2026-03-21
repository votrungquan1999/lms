import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthService } from "src/lib/auth-singleton";

export const metadata = {
  title: "Redirecting… — LMS",
  description: "Redirecting to your dashboard",
};

/**
 * Redirect page: determines the authenticated user's role
 * and redirects them to the appropriate dashboard.
 * If the session is invalid or expired, clears the stale cookie
 * and redirects back to `/` (prevents infinite redirect loop).
 */
export default async function RedirectPage() {
  const requestHeaders = new Headers();
  const cookieStore = await cookies();
  requestHeaders.set("cookie", cookieStore.toString());

  const authService = await getAuthService();
  const session = await authService.getSession(requestHeaders);

  if (!session) {
    // Stale or invalid cookie — clear it to break the redirect loop
    cookieStore.delete("better-auth.session_token");
    redirect("/");
  }

  if (session.role === "admin") {
    redirect("/admin/dashboard");
  }

  if (session.role === "student") {
    redirect("/student/dashboard");
  }

  // Fallback: unknown role — clear cookie and go home
  cookieStore.delete("better-auth.session_token");
  redirect("/");
}
