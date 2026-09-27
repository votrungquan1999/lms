// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAndJumpToNextAction } from "../../../courses/[courseId]/tests/[testId]/grading/actions";
import { GradingDetailQuestion } from "../grading-detail-question";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  }),
}));

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

describe("Feature: Save & Next in the By-question view never lands on a student with no grading form", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("builds a candidate list that excludes a student who left the focused question blank, and Save & Next honors it end to end", async () => {
    // Given: one free-text question, 3 students — one already graded, one
    // left it blank (no answer at all), one answered but not yet graded.
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const testDoc = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(testDoc.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });

    const graded = await services.studentService.createStudentDocument({
      authUserId: "auth-graded",
      username: "graded",
      name: "Graded Student",
      createdBy: "admin",
    });
    const blank = await services.studentService.createStudentDocument({
      authUserId: "auth-blank",
      username: "blank",
      name: "Blank Student",
      createdBy: "admin",
    });
    const ungraded = await services.studentService.createStudentDocument({
      authUserId: "auth-ungraded",
      username: "ungraded",
      name: "Ungraded Student",
      createdBy: "admin",
    });
    for (const student of [graded, blank, ungraded]) {
      await services.enrollmentService.enrollStudent(
        course.id,
        student.id,
        "admin",
      );
    }

    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: question.id,
      studentId: graded.id,
      answer: { type: "free_text", text: "graded answer" },
    });
    await services.gradeService.gradeQuestion({
      testId: testDoc.id,
      questionId: question.id,
      studentId: graded.id,
      score: 90,
      feedback: "Nice",
      gradedBy: "admin",
    });
    // `blank` never submits an answer to this question at all.
    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: question.id,
      studentId: ungraded.id,
      answer: { type: "free_text", text: "ungraded answer" },
    });

    // Roster order puts the blank student right after the graded one, so
    // the old unfiltered candidate list would walk into it first.
    const ui = await GradingDetailQuestion({
      test: testDoc,
      courseId: course.id,
      questionId: question.id,
      students: [
        { id: graded.id, name: graded.name, username: graded.username },
        { id: blank.id, name: blank.name, username: blank.username },
        {
          id: ungraded.id,
          name: ungraded.name,
          username: ungraded.username,
        },
      ],
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then: the graded student's candidate list excludes the blank student.
    const gradedCard = screen.getByTestId(`student-card-${graded.id}`);
    const candidateIdsInput = gradedCard.querySelector(
      'input[name="candidateIds"]',
    ) as HTMLInputElement;
    expect(candidateIdsInput.value.split(",")).toEqual([
      graded.id,
      ungraded.id,
    ]);
    expect(candidateIdsInput.value).not.toContain(blank.id);

    // When: Save & Next is submitted from the graded student (mirrors the
    // real hidden-input payload for this question).
    const formData = new FormData();
    formData.set("testId", testDoc.id);
    formData.set("courseId", course.id);
    formData.set("questionId", question.id);
    formData.set("studentId", graded.id);
    formData.set("currentStudentId", graded.id);
    formData.set("candidateIds", candidateIdsInput.value);
    formData.set("returnPath", "/admin/grading/test-1");
    formData.set("mode", "question");
    formData.set("score", "90");
    formData.set("feedback", "Nice");

    await expect(saveAndJumpToNextAction(formData)).rejects.toThrow(
      /__REDIRECT__:/,
    );

    // Then: redirect lands on the ungraded-but-answered student, never the
    // blank one — the blank has no grading form to land on at all.
    const url = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    expect(url).toContain(`studentId=${ungraded.id}`);
    expect(url).not.toContain(`studentId=${blank.id}`);
  });
});
