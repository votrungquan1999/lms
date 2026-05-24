// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "src/components/ui/tooltip";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboardPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

describe("Feature: Dashboard Grading card", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render a Grading card linking to /admin/grading with 'Tests needing grading' and 'Students waiting' counts derived from submitted-but-ungraded students", async () => {
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test1 = await services.testService.createTest(course.id, {
      title: "T1",
      description: "",
      createdBy: "admin",
    });
    const test2 = await services.testService.createTest(course.id, {
      title: "T2",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test1.id, {
      type: "free_text",
      title: "Q",
      content: "Q",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test2.id, {
      type: "free_text",
      title: "Q",
      content: "Q",
      createdBy: "admin",
    });
    const [q1] = await services.questionService.listQuestions(test1.id);
    const [q2] = await services.questionService.listQuestions(test2.id);

    // Two students, both Submitted on test1 (so test1 has 2 waiting)
    // No one has done test2 (so test2 has 0 waiting -> not counted)
    for (const [u, n] of [
      ["a", "Ann"],
      ["b", "Ben"],
    ] as const) {
      const s = await services.studentService.createStudentDocument({
        authUserId: `auth-${u}`,
        username: u,
        name: n,
        createdBy: "admin",
      });
      await services.enrollmentService.enrollStudent(course.id, s.id, "admin");
      await services.answerService.submitAnswer({
        testId: test1.id,
        questionId: q1.id,
        studentId: s.id,
        answer: { type: "free_text", text: "x" },
      });
    }

    // Sanity reference: q2 unused so test2 has 0 submitted students
    expect(q2.id).toBeTruthy();

    const ui = await AdminDashboardPage();
    render(<TooltipProvider>{ui}</TooltipProvider>);

    const card = screen.getByRole("link", { name: /Grading/i });
    expect(card.getAttribute("href")).toBe("/admin/grading");

    const cardText = card.textContent ?? "";
    expect(cardText).toMatch(/Tests needing grading/);
    expect(cardText).toMatch(/Students waiting/);
    // 1 test waits (test1), 2 students total are waiting
    const testsCount = card.querySelector(
      '[data-stat="tests-needing-grading"]',
    )?.textContent;
    const studentsCount = card.querySelector(
      '[data-stat="students-waiting"]',
    )?.textContent;
    expect(testsCount).toBe("1");
    expect(studentsCount).toBe("2");
  });
});
