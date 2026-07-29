// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { revalidatePath } from "next/cache";
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

describe("Feature: Test Settings Panel — admin edits visibility flags", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("Admin toggles both flags, submits, and DB + UI + revalidatePath reflect the change", async () => {
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
      // Seed non-default booleans so the toggle is observable.
      showGradeAfterSubmit: false,
      showCorrectAnswerAfterSubmit: false,
    });

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const gradeCheckbox = screen.getByRole("checkbox", {
      name: /show grade after submit/i,
    });
    const correctCheckbox = screen.getByRole("checkbox", {
      name: /show correct answer after submit/i,
    });

    expect(gradeCheckbox).not.toBeChecked();
    expect(correctCheckbox).not.toBeChecked();

    await user.click(gradeCheckbox);
    await user.click(correctCheckbox);

    const saveBtn = screen.getByRole("button", { name: /save settings/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
    });

    const after = await services.testService.getTest(test.id);
    expect(after?.showGradeAfterSubmit).toBe(true);
    expect(after?.showCorrectAnswerAfterSubmit).toBe(true);

    const revalidatedPaths = vi
      .mocked(revalidatePath)
      .mock.calls.map((c) => c[0]);
    expect(revalidatedPaths).toContain(
      `/admin/courses/${course.id}/tests/${test.id}`,
    );
    expect(revalidatedPaths).toContain(`/admin/courses/${course.id}`);
    expect(revalidatedPaths).toContain(
      `/student/courses/${course.id}/tests/${test.id}`,
    );
  });

  it("Admin toggles practice mode on, submits, and DB reflects the change", async () => {
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
    });

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const practiceCheckbox = screen.getByRole("checkbox", {
      name: /practice test/i,
    });
    expect(practiceCheckbox).not.toBeChecked();

    await user.click(practiceCheckbox);
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
    });

    const after = await services.testService.getTest(test.id);
    expect(after?.isPractice).toBe(true);
  });

  it("renders the formatted release dates in muted text when both are set", async () => {
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
    });
    // Set both release timestamps via the existing release mutators.
    await services.testService.releaseGrades(test.id, "admin");
    await services.testService.releaseCorrectAnswers(test.id, "admin");

    const fresh = await services.testService.getTest(test.id);
    if (!fresh) throw new Error("seeded test missing after release mutators");
    const expectedGrades = (fresh.gradesReleasedAt as Date).toLocaleDateString(
      "en-US",
    );
    const expectedCorrect = (
      fresh.correctAnswersReleasedAt as Date
    ).toLocaleDateString("en-US");

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(
      screen.getByText(new RegExp(`grades released at ${expectedGrades}`, "i")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`correct answers released at ${expectedCorrect}`, "i"),
      ),
    ).toBeInTheDocument();
  });

  it("renders 'Not released' muted text when each release timestamp is null", async () => {
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
    });
    // Both release timestamps remain null after createTest's defaults.

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText(/grades: not released/i)).toBeInTheDocument();
    expect(
      screen.getByText(/correct answers: not released/i),
    ).toBeInTheDocument();
  });

  it("On admin auth failure, DB is untouched and error UI is shown", async () => {
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
      showGradeAfterSubmit: false,
      showCorrectAnswerAfterSubmit: false,
    });

    mockRequireAdminSession.mockRejectedValue(new Error("unauthorized"));

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const gradeCheckbox = screen.getByRole("checkbox", {
      name: /show grade after submit/i,
    });
    await user.click(gradeCheckbox);

    const saveBtn = screen.getByRole("button", { name: /save settings/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/unauthorized: admin access required/i),
      ).toBeInTheDocument();
    });

    const after = await services.testService.getTest(test.id);
    expect(after?.showGradeAfterSubmit).toBe(false);
    expect(after?.showCorrectAnswerAfterSubmit).toBe(false);
  });
});
