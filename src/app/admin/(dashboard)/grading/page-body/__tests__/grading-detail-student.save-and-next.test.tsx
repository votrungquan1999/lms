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
import { GradingDetailStudent } from "../grading-detail-student";

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

describe("Feature: Save & Next skips a read-only MC question and lands on the next form-bearing free-text question", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("builds a form-bearing candidate list that excludes an answered MC sitting between two free-text questions, and Save & Next honors it end to end (mid-list skip, last-question stop)", async () => {
    // Given: Q1 free-text, Q2 single_select (MC, read-only), Q3 free-text — all answered.
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

    const q1 = await services.questionService.addQuestion(testDoc.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const q2 = await services.questionService.addQuestion(testDoc.id, {
      type: "single_select",
      title: "Q2 (MC)",
      content: "Q2",
      createdBy: "admin",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: false },
      ],
    });
    const q3 = await services.questionService.addQuestion(testDoc.id, {
      type: "free_text",
      title: "Q3",
      content: "Q3",
      createdBy: "admin",
    });

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "stu",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer 1" },
    });
    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: q2.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [q2.options[0].id] },
    });
    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: q3.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer 3" },
    });

    const ui = await GradingDetailStudent({
      test: testDoc,
      courseId: course.id,
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
      },
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then: Q1's Save & Next form carries a candidateIds list that skips Q2 (MC).
    const q1Card = screen
      .getByText("Q1")
      .closest('[data-testid="grade-card"]') as HTMLElement;
    const candidateIdsInput = q1Card.querySelector(
      'input[name="candidateIds"]',
    ) as HTMLInputElement;
    expect(candidateIdsInput.value.split(",")).toEqual([q1.id, q3.id]);

    // When: Save & Next is submitted from Q1 (mirrors the real hidden-input payload).
    const formData = new FormData();
    formData.set("testId", testDoc.id);
    formData.set("courseId", course.id);
    formData.set("questionId", q1.id);
    formData.set("studentId", student.id);
    formData.set("currentStudentId", student.id);
    formData.set("candidateIds", candidateIdsInput.value);
    formData.set("returnPath", "/admin/grading/test-1");
    formData.set("mode", "student");
    formData.set("score", "90");
    formData.set("feedback", "Nice");

    await expect(saveAndJumpToNextAction(formData)).rejects.toThrow(
      /__REDIRECT__:/,
    );
    const midListUrl = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    // Then: redirect lands on Q3 — the MC (Q2) is skipped entirely.
    expect(midListUrl).toContain(`#question-${q3.id}`);
    expect(midListUrl).not.toContain(q2.id);

    // Given: Q3 is now the LAST form-bearing question (fresh FormData, not
    // reused, so this scenario stays independent of the mid-list one above).
    vi.mocked(redirect).mockClear();
    const lastFormData = new FormData();
    lastFormData.set("testId", testDoc.id);
    lastFormData.set("courseId", course.id);
    lastFormData.set("questionId", q3.id);
    lastFormData.set("studentId", student.id);
    lastFormData.set("currentStudentId", student.id);
    lastFormData.set("candidateIds", candidateIdsInput.value);
    lastFormData.set("returnPath", "/admin/grading/test-1");
    lastFormData.set("mode", "student");
    lastFormData.set("score", "90");
    lastFormData.set("feedback", "Nice");

    // When + Then: stop — redirect keeps the same student with NO anchor.
    await expect(saveAndJumpToNextAction(lastFormData)).rejects.toThrow(
      /__REDIRECT__:/,
    );
    const lastUrl = vi.mocked(redirect).mock.calls[0]?.[0] as string;
    expect(lastUrl).toContain(`studentId=${student.id}`);
    expect(lastUrl).not.toContain("#question-");
  });

  it("excludes an unanswered free-text question and an image_answer question from the candidate list (they render no Save & Next button)", async () => {
    // Given: Q1 free-text (answered), Q2 free-text (NOT answered), Q3
    // image_answer (answered with a photo), Q4 free-text (answered).
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

    const q1 = await services.questionService.addQuestion(testDoc.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const q2 = await services.questionService.addQuestion(testDoc.id, {
      type: "free_text",
      title: "Q2 unanswered",
      content: "Q2",
      createdBy: "admin",
    });
    const q3 = await services.questionService.addQuestion(testDoc.id, {
      type: "image_answer",
      title: "Q3 image",
      content: "Q3",
      createdBy: "admin",
    });
    const q4 = await services.questionService.addQuestion(testDoc.id, {
      type: "free_text",
      title: "Q4",
      content: "Q4",
      createdBy: "admin",
    });

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "stu",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    // Q2 is intentionally left unanswered.
    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer 1" },
    });
    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: q3.id,
      studentId: student.id,
      answer: { type: "image", mediaKeys: [`answers/${student.id}/p.png`] },
    });
    await services.answerService.submitAnswer({
      testId: testDoc.id,
      questionId: q4.id,
      studentId: student.id,
      answer: { type: "free_text", text: "answer 4" },
    });

    const ui = await GradingDetailStudent({
      test: testDoc,
      courseId: course.id,
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
      },
      basePath: "/admin/grading/test-1",
    });
    render(ui);

    // Then: Q1's candidate list contains ONLY the answered free-text questions
    // (Q1, Q4) — the unanswered free-text (Q2) and the image_answer (Q3) are
    // excluded, so Save & Next can never target a question with no button.
    const q1Card = screen
      .getByText("Q1")
      .closest('[data-testid="grade-card"]') as HTMLElement;
    const candidateIdsInput = q1Card.querySelector(
      'input[name="candidateIds"]',
    ) as HTMLInputElement;
    expect(candidateIdsInput.value.split(",")).toEqual([q1.id, q4.id]);
    expect(candidateIdsInput.value).not.toContain(q2.id);
    expect(candidateIdsInput.value).not.toContain(q3.id);
  });
});
