import Link from "next/link";
import { LogoutButton } from "./logout-button";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">403</h1>
        <h2 className="text-2xl font-semibold tracking-tight">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to access this page. Please sign in with an
          account that has the required role.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Return Home
          </Link>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
