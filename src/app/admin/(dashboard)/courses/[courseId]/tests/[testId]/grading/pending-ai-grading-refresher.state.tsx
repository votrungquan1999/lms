"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 10_000;

/**
 * Re-renders the grading page's server tree on a timer while an AI grading job
 * is pending, so a finished job's suggestions appear without a manual reload.
 */
export function usePendingAiGradingRefresh(): void {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
}
