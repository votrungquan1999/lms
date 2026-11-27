// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingPage from "../../../courses/[courseId]/tests/[testId]/grading/page";
import GradingVariantPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));
vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions",
  () => ({
    gradeQuestionAction: vi.fn(),
    setTestFeedbackAction: vi.fn(),
    releaseGradesAction: vi.fn(),
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
    saveAndJumpToNextAction: vi.fn(),
  }),
);

describe("Feature: the grading top bar", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it.each([
    ["To grade", "variant"],
    ["the test page", "course"],
  ])(
    "opened from %s shows the back link, the pivot, the student's place among submitted students and the fully graded count over submitted students",
    async (_label, route) => {
      const services = getTestServices();
      const course = await services.courseService.createCourse({
        title: "Algebra 101",
        description: "",
        createdBy: "admin",
      });
      const test = await services.testService.createTest(course.id, {
        title: "Midterm",
        description: "",
        createdBy: "admin",
      });
      await services.questionService.addQuestion(test.id, {
        type: "free_text",
        title: "Q1",
        content: "Q1",
        createdBy: "admin",
      });
      const [q1] = await services.questionService.listQuestions(test.id);

      // Given: three enrolled students, two handed in, one of those graded
      const ids: Record<string, string> = {};
      for (const [user, name] of [
        ["alice", "Alice"],
        ["bob", "Bob"],
        ["carol", "Carol"],
      ]) {
        const s = await services.studentService.createStudentDocument({
          authUserId: `auth-${user}`,
          username: user,
          name,
          createdBy: "admin",
        });
        await services.enrollmentService.enrollStudent(
          course.id,
          s.id,
          "admin",
        );
        await new Promise((r) => setTimeout(r, 5));
        ids[user] = s.id;
        if (user === "carol") continue;
        await services.answerService.submitAnswer({
          testId: test.id,
          questionId: q1.id,
          studentId: s.id,
          answer: { type: "free_text", text: user },
        });
        await services.testSubmissionService.submitTest(test.id, s.id);
      }
      await services.gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: ids.alice as string,
        score: 90,
        feedback: "ok",
        gradedBy: "admin",
      });

      // When: the teacher opens Bob on either route
      const searchParams = Promise.resolve({ studentId: ids.bob as string });
      const ui =
        route === "variant"
          ? await GradingVariantPage({
              params: Promise.resolve({ testId: test.id }),
              searchParams,
            })
          : await GradingPage({
              params: Promise.resolve({
                courseId: course.id,
                testId: test.id,
              }),
              searchParams,
            });
      render(ui);

      // Then: the top bar names the way back, both modes and the place
      const bar = screen.getByTestId("grading-top-bar");
      expect(
        within(bar).getByRole("link", { name: /Midterm/ }),
      ).toHaveAttribute("href", `/admin/courses/${course.id}/tests/${test.id}`);
      expect(
        within(bar).getByRole("tab", { name: "By student" }),
      ).toBeInTheDocument();
      expect(
        within(bar).getByRole("tab", { name: "By question" }),
      ).toBeInTheDocument();
      expect(
        within(bar).getByTestId("grading-student-position"),
      ).toHaveTextContent(/Bob\s*‹\s*1 of 2 submitted\s*›/);
      // Bob is first among the submitted, so ‹ goes nowhere and › opens Alice
      expect(
        within(bar).queryByRole("link", { name: "Previous submitted student" }),
      ).not.toBeInTheDocument();
      expect(
        within(bar).getByRole("link", { name: "Next submitted student" }),
      ).toHaveAttribute(
        "href",
        expect.stringContaining(`studentId=${ids.alice}`),
      );
      expect(
        within(bar).getByTestId("grading-progress-fraction"),
      ).toHaveTextContent("1 of 2 fully graded");
      // Two students handed in, so the empty-state message stays away
      expect(
        screen.queryByText("Nobody has submitted yet."),
      ).not.toBeInTheDocument();
    },
  );
});
