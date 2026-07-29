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
import { setTestSettingsAction } from "../settings-actions";

const mockRequireAdminSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
  // withSpan's catch branch calls this on every thrown error; a real
  // no-op for generic errors, so it must be present in the mock too.
  unstable_rethrow: vi.fn(),
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

describe("Feature: Test Settings Panel — admin sets a time limit", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
    mockRequireAdminSession.mockResolvedValue({ userId: "admin-1" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows a time-limit input that is empty for an untimed test", async () => {
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

    const input = screen.getByLabelText(/time limit \(minutes\)/i);
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("persists a positive integer time limit entered in the panel", async () => {
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

    await user.type(screen.getByLabelText(/time limit \(minutes\)/i), "45");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(async () => {
      const after = await services.testService.getTest(test.id);
      expect(after?.timeLimitMinutes).toBe(45);
    });
  });

  it("clearing the time-limit input persists untimed (null)", async () => {
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
    await services.testService.updateTestSettings(test.id, {
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
      timeLimitMinutes: 30,
      isPractice: false,
      updatedBy: "admin",
    });

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const input = screen.getByLabelText(/time limit \(minutes\)/i);
    expect((input as HTMLInputElement).value).toBe("30");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(async () => {
      const after = await services.testService.getTest(test.id);
      expect(after?.timeLimitMinutes).toBeNull();
    });
  });

  it("rejects a non-positive time limit and leaves the saved value unchanged", async () => {
    // The action's zod rule is the source of truth; jsdom's number input drops
    // invalid values on read, so drive the validation through the action with a
    // raw "0" the way the browser would submit it.
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
    await services.testService.updateTestSettings(test.id, {
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
      timeLimitMinutes: 20,
      isPractice: false,
      updatedBy: "admin",
    });

    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);
    formData.set("showGradeAfterSubmit", "true");
    formData.set("showCorrectAnswerAfterSubmit", "true");
    formData.set("timeLimitMinutes", "0");

    const result = await setTestSettingsAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/positive whole number/i);
    const after = await services.testService.getTest(test.id);
    expect(after?.timeLimitMinutes).toBe(20);
  });

  it("rejects turning on practice mode while a time limit is set, and leaves the saved value unchanged", async () => {
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
    await services.testService.updateTestSettings(test.id, {
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
      timeLimitMinutes: 20,
      isPractice: false,
      updatedBy: "admin",
    });

    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);
    formData.set("showGradeAfterSubmit", "true");
    formData.set("showCorrectAnswerAfterSubmit", "true");
    formData.set("timeLimitMinutes", "20");
    formData.set("isPractice", "true");

    const result = await setTestSettingsAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/practice test cannot have a time limit/i);
    const after = await services.testService.getTest(test.id);
    expect(after?.isPractice).toBe(false);
    expect(after?.timeLimitMinutes).toBe(20);
  });
});
