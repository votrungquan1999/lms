import Link from "next/link";
import { getAuthService } from "src/lib/auth-singleton";
import { getPageGuard } from "src/lib/services-singleton";

export const metadata = {
  title: "Not part of a school — LMS Admin",
  description: "This account isn't part of any school yet",
};

/**
 * Shown to a staff account with no school membership — `requireSchoolAdmin`
 * redirects here from every school-scoped page. Guards with
 * `requireAdminLogin()` ONLY, never `requireSchoolAdmin()`: calling that
 * here would redirect a school-less admin back to this same page.
 */
export default async function NoSchoolPage() {
  const guard = await getPageGuard();
  const adminSession = await guard.requireAdminLogin();
  // A fresh install's owner has no school yet; point them at where to make one.
  const authService = await getAuthService();
  const isOwner = await authService.isAdminEmail(adminSession.email);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">
        You aren't part of any school yet
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ask the platform owner to add you as an admin of a school. Once you're
        added, sign in again to reach its data.
      </p>
      {isOwner && (
        <Link
          href="/admin/schools"
          className="text-sm font-medium underline underline-offset-4"
        >
          Go to the schools console
        </Link>
      )}
    </div>
  );
}
