// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingAiGradingRefresher } from "../pending-ai-grading-refresher.ui";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("Feature: the grading page refreshes itself while an AI job is pending", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes the page once every 10 seconds while mounted", () => {
    // Given the refresher is on screen
    render(<PendingAiGradingRefresher />);
    expect(refresh).not.toHaveBeenCalled();

    // When 10 seconds pass
    vi.advanceTimersByTime(10_000);

    // Then the page was refreshed once, and again after the next 10 seconds
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops refreshing once it is unmounted", () => {
    // Given a mounted refresher
    const { unmount } = render(<PendingAiGradingRefresher />);

    // When it leaves the page, as it does once the job finishes
    unmount();
    vi.advanceTimersByTime(30_000);

    // Then no further refresh happens
    expect(refresh).not.toHaveBeenCalled();
  });
});
