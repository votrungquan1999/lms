// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";

const mockRequireAdminSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    requireAdminSession: (...args: unknown[]) =>
      mockRequireAdminSession(...args),
  }),
}));

describe("Feature: Test Settings Panel — answer-reveal display choice", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("Admin switches a test to show the correct answer plainly, and the choice is still there on a later visit", async () => {
    const user = userEvent.setup();
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
      answerRevealMode: "diff",
    });

    const firstVisit = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    const { unmount } = render(firstVisit);

    // Given: the test starts on side-by-side comparison
    expect(screen.getByRole("radio", { name: /side-by-side/i })).toBeChecked();

    // When: the admin picks "plain" and saves
    await user.click(screen.getByRole("radio", { name: /plainly/i }));
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
    });

    const after = await services.testService.getTest(test.id);
    expect(after?.answerRevealMode).toBe("plain");

    // Then: coming back to the page later still shows the persisted choice
    unmount();
    const secondVisit = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(secondVisit);

    expect(screen.getByRole("radio", { name: /plainly/i })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /side-by-side/i }),
    ).not.toBeChecked();
  });
});
