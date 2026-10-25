"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useLeaveGuard } from "./leave-guard.state";

/** A `next/link` that asks the teacher to confirm first when work is on screen. */
export function GuardedLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "onNavigate"> & { href: string }) {
  const router = useRouter();
  const { hasWork, requestLeave } = useLeaveGuard();

  return (
    <Link
      href={href}
      onNavigate={(event) => {
        if (!hasWork) return;
        // Stops Next from navigating; the dialog decides.
        event.preventDefault();
        requestLeave(() => router.push(href));
      }}
      {...props}
    />
  );
}
