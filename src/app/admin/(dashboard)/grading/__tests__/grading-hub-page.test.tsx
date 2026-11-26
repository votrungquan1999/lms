// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingHubPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

describe("Feature: To grade page", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lists a test with a submission waiting under its course, with the two grading links and no filter pills", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Alpha",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Quiz",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q",
      content: "Q",
      createdBy: "admin",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-ann",
      username: "ann",
      name: "Ann",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "x" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    render(await GradingHubPage());

    expect(
      screen.getByRole("heading", { name: "To grade" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 submission waiting")).toBeInTheDocument();
    const row = within(screen.getByTestId(`hub-test-card-${test.id}`));
    expect(row.getByRole("link", { name: "Quiz" })).toHaveAttribute(
      "href",
      `/admin/courses/${course.id}/tests/${test.id}`,
    );
    expect(
      row.getByText("Ann submitted today", { exact: false }),
    ).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Continue grading" })).toHaveAttribute(
      "href",
      `/admin/grading/${test.id}`,
    );
    expect(row.getByRole("link", { name: "By question" })).toHaveAttribute(
      "href",
      `/admin/grading/${test.id}?mode=question`,
    );
    expect(
      screen.queryByRole("navigation", { name: "Filter tests" }),
    ).toBeNull();
  });
  /** Seeds a two-student test where Ann is fully graded and Bob's hand-in still waits. */
  async function seedOneGradedOneWaiting(showGradeAfterSubmit: boolean) {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Alpha",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Quiz",
      description: "",
      showGradeAfterSubmit,
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q",
      content: "Q",
      createdBy: "admin",
    });
    for (const [name, graded] of [
      ["ann", true],
      ["bob", false],
    ] as const) {
      const student = await services.studentService.createStudentDocument({
        authUserId: `auth-${name}`,
        username: name,
        name,
        createdBy: "admin",
      });
      await services.enrollmentService.enrollStudent(
        course.id,
        student.id,
        "admin",
      );
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        answer: { type: "free_text", text: "x" },
      });
      await services.testSubmissionService.submitTest(test.id, student.id);
      if (graded) {
        await services.gradeService.gradeQuestion({
          testId: test.id,
          questionId: question.id,
          studentId: student.id,
          score: 1,
          feedback: "ok",
          gradedBy: "admin",
        });
      }
    }
  }

  it("does not say students can see every grade while a graded student cannot see theirs", async () => {
    await seedOneGradedOneWaiting(false);

    render(await GradingHubPage());

    expect(
      screen.queryByText("Students can see every grade you have given."),
    ).toBeNull();
    expect(screen.getByText("Nothing to release yet.")).toBeInTheDocument();
  });

  it("says students can see every grade when every graded student can see theirs", async () => {
    await seedOneGradedOneWaiting(true);

    render(await GradingHubPage());

    expect(
      screen.getByText("Students can see every grade you have given."),
    ).toBeInTheDocument();
  });
});
