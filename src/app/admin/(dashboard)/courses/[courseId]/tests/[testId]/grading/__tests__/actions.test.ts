import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const gradeQuestion = vi.fn().mockResolvedValue(undefined);
const setTestFeedback = vi.fn().mockResolvedValue(undefined);
const releaseGrades = vi.fn().mockResolvedValue(undefined);
const requestRedo = vi.fn().mockResolvedValue(undefined);
const getLatestSuggestion = vi.fn().mockResolvedValue(null);

vi.mock("src/lib/services-singleton", () => ({
  getGradeService: vi.fn(async () => ({ gradeQuestion })),
  getTestFeedbackService: vi.fn(async () => ({ setTestFeedback })),
  getTestService: vi.fn(async () => ({ releaseGrades })),
  getRedoRequestService: vi.fn(async () => ({ requestRedo })),
  getAiGradeService: vi.fn(async () => ({ getLatestSuggestion })),
}));

import {
  gradeQuestionAction,
  releaseGradesAction,
  requestRedoAction,
  setTestFeedbackAction,
} from "../actions";

describe("Feature: grading actions extend revalidatePath to hub, variant page, and dashboard", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("each successful action revalidates /admin/grading, /admin/grading/<testId>, and /admin/dashboard in addition to the course-scoped path", async () => {
    const testId = "test-1";
    const courseId = "course-1";

    const fdGrade = new FormData();
    fdGrade.set("testId", testId);
    fdGrade.set("courseId", courseId);
    fdGrade.set("questionId", "q-1");
    fdGrade.set("studentId", "stu-1");
    fdGrade.set("score", "80");
    fdGrade.set("feedback", "ok");
    await gradeQuestionAction(null, fdGrade);

    const fdFb = new FormData();
    fdFb.set("testId", testId);
    fdFb.set("courseId", courseId);
    fdFb.set("studentId", "stu-1");
    fdFb.set("feedback", "good");
    await setTestFeedbackAction(null, fdFb);

    const fdRel = new FormData();
    fdRel.set("testId", testId);
    fdRel.set("courseId", courseId);
    await releaseGradesAction(null, fdRel);

    const fdRedo = new FormData();
    fdRedo.set("testId", testId);
    fdRedo.set("courseId", courseId);
    fdRedo.set("studentId", "stu-1");
    await requestRedoAction(null, fdRedo);

    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);

    // Course-scoped path still hit (existing behavior)
    expect(calls).toContain(
      `/admin/courses/${courseId}/tests/${testId}/grading`,
    );
    // New paths added by Step 13 — each must appear at least once across the four actions
    expect(calls).toContain("/admin/grading");
    expect(calls).toContain(`/admin/grading/${testId}`);
    expect(calls).toContain("/admin/dashboard");

    // Step 15 fix: releaseGradesAction now also revalidates the student page
    // so the student sees grades on the next visit after a global release.
    expect(calls).toContain(`/student/courses/${courseId}/tests/${testId}`);
  });
});

describe("Feature: a teacher's own grade on an AI-graded question records how far it is from the AI's", () => {
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
    getLatestSuggestion.mockReset();
  });

  afterEach(() => {
    trace.disable();
  });

  it("records the AI's score next to the teacher's, the gap, and which texts differ", async () => {
    getLatestSuggestion.mockResolvedValueOnce({
      score: 70,
      feedback: "AI feedback",
      solution: undefined,
    });

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("questionId", "q-1");
    fd.set("studentId", "stu-1");
    fd.set("score", "80");
    fd.set("feedback", "Teacher feedback");
    await gradeQuestionAction(null, fd);

    expect(getLatestSuggestion).toHaveBeenCalledWith("test-1", "q-1", "stu-1");
    const actionSpan = exporter
      .getFinishedSpans()
      .find((span) => span.name === "action.gradeQuestionAction");
    expect(actionSpan?.attributes).toMatchObject({
      "lms.ai.outcome": "manually_graded",
      "lms.ai.suggestion_score": 70,
      "lms.ai.final_score": 80,
      "lms.ai.score_gap": 10,
      "lms.ai.feedback_changed": true,
      "lms.ai.solution_changed": false,
    });
  });

  it("records nothing AI-related when the AI never suggested a grade for the question", async () => {
    getLatestSuggestion.mockResolvedValueOnce(null);

    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("questionId", "q-1");
    fd.set("studentId", "stu-1");
    fd.set("score", "80");
    fd.set("feedback", "Teacher feedback");
    const state = await gradeQuestionAction(null, fd);

    expect(state.success).toBe(true);
    const actionSpan = exporter
      .getFinishedSpans()
      .find((span) => span.name === "action.gradeQuestionAction");
    expect(actionSpan).toBeDefined();
    expect(
      Object.keys(actionSpan?.attributes ?? {}).filter((key) =>
        key.startsWith("lms.ai."),
      ),
    ).toEqual([]);
  });
});
