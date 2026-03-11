"use client";

import { useRouter } from "next/navigation";
import { Button } from "src/components/ui/button";
import { authClient } from "src/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={handleLogout}>
      Sign Out
    </Button>
  );
}
