"use client";

import { usePendingAiGradingRefresh } from "./pending-ai-grading-refresher.state";

/**
 * Mounted only while a grading job is pending; renders nothing and keeps the
 * page refreshing for as long as it is on screen.
 */
export function PendingAiGradingRefresher() {
  usePendingAiGradingRefresh();
  return null;
}
