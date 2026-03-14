"use client";

import { BookOpen, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "src/components/ui/button";
import { authClient } from "src/lib/auth-client";

/**
 * Top navigation header for student pages.
 * Shows branding, student name, and logout button.
 */
export function StudentHeader({ username }: { username: string }) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <Link
        href="/student/dashboard"
        className="flex items-center gap-2 font-semibold"
      >
        <BookOpen className="size-5" />
        <span>LMS</span>
      </Link>

      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">@{username}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-1.5 size-4" />
          Sign Out
        </Button>
      </div>
    </header>
  );
}
