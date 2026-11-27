import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Db } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AI_GRADER_ID,
  AI_MODEL_NAME,
  type AiGradeSuggestionDocument,
} from "src/lib/ai-grade-types";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAndNextAction } from "../../../courses/[courseId]/tests/[testId]/grading/actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  }),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireAdminSession: vi
      .fn()
      .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL }),
  })),
}));

type QuestionKind = "written" | "choice" | "photo";

/** A course with one test whose questions have the given kinds, in order. */
async function seedTest(kinds: QuestionKind[]) {
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
  const questions = [];
  for (const [index, kind] of kinds.entries()) {
    const title = `Q${index + 1}`;
    questions.push(
      kind === "choice"
        ? await services.questionService.addQuestion(test.id, {
            type: "single_select",
            title,
            content: title,
            createdBy: "admin",
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          })
        : await services.questionService.addQuestion(test.id, {
            type: (kind === "photo"
              ? "image_answer"
              : "free_text") as "image_answer",
            title,
            content: title,
            createdBy: "admin",
          }),
    );
  }
  return { services, course, test, questions };
}

type Seed = Awaited<ReturnType<typeof seedTest>>;

/** Enrolls a student who answers every question, hands in, and optionally has some answers graded. */
async function seedHandedInStudent(
  seed: Seed,
  name: string,
  options: { graded?: number[]; stillWriting?: boolean } = {},
) {
  const { services, course, test, questions } = seed;
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${name}`,
    username: name.toLowerCase(),
    name,
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );
  for (const question of questions) {
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer:
        question.type === "single_select"
          ? { type: "mc", selectedIds: [question.options[0].id] }
          : question.type === "image_answer"
            ? { type: "image", mediaKeys: [`answers/${student.id}/p.png`] }
            : { type: "free_text", text: `${name} answer` },
    });
  }
  if (!options.stillWriting) {
    await services.testSubmissionService.submitTest(test.id, student.id);
  }
  // Hand-ins must differ in time for "oldest first" to be decidable.
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (const index of options.graded ?? []) {
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: questions[index].id,
      studentId: student.id,
      score: 70,
      feedback: "earlier",
      gradedBy: "admin",
    });
  }
  return student;
}

function saveForm(
  seed: Seed,
  studentId: string,
  questionId: string,
  extra: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.set("routeKind", "hub");
  form.set("mode", "student");
  form.set("testId", seed.test.id);
  form.set("courseId", seed.course.id);
  form.set("studentId", studentId);
  form.set("questionId", questionId);
  form.set("score", "85");
  form.set("feedback", "Good work");
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

/** Runs the action and returns the link it redirected to. */
async function redirectedTo(form: FormData): Promise<URL> {
  vi.mocked(redirect).mockClear();
  await expect(saveAndNextAction(form)).rejects.toThrow(/__REDIRECT__:/);
  const url = vi.mocked(redirect).mock.calls[0]?.[0] as string;
  return new URL(url, "http://lms.test");
}

describe("Feature: Save & next moves to the next answer that needs a grade", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("saves the grade, then opens this student's next written or photo answer that needs one, skipping a choice answer and a graded one", async () => {
    // Given Ann answered a written, a choice, a graded written and a photo question
    const seed = await seedTest(["written", "choice", "written", "photo"]);
    const ann = await seedHandedInStudent(seed, "Ann", { graded: [2] });
    const [q1, , , q4] = seed.questions;

    // When the teacher saves Q1 with Save & next
    const url = await redirectedTo(saveForm(seed, ann.id, q1.id));

    // Then the grade is saved, the grading pages refresh, and Q4 (the photo) opens on the same student
    const saved = await seed.services.gradeService.getGrade(
      seed.test.id,
      q1.id,
      ann.id,
    );
    expect(saved?.score).toBe(85);
    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        `/admin/courses/${seed.course.id}/tests/${seed.test.id}/grading`,
        "/admin/grading",
        `/admin/grading/${seed.test.id}`,
      ]),
    );
    expect(url.pathname).toBe(`/admin/grading/${seed.test.id}`);
    expect(url.searchParams.get("studentId")).toBe(ann.id);
    expect(url.searchParams.get("questionId")).toBe(q4.id);
  });

  it("keeps the saved solution when none is posted, and clears it when an empty one is", async () => {
    // Given Ann's written answer has a saved solution
    const seed = await seedTest(["written"]);
    const ann = await seedHandedInStudent(seed, "Ann");
    const [q1] = seed.questions;
    const solutionOf = async () =>
      (await seed.services.gradeService.getGrade(seed.test.id, q1.id, ann.id))
        ?.solution ?? null;
    await seed.services.gradeService.gradeQuestion({
      testId: seed.test.id,
      questionId: q1.id,
      studentId: ann.id,
      score: 70,
      feedback: "earlier",
      solution: "the model solution",
      gradedBy: "admin",
    });

    // When the teacher saves with no solution field
    await redirectedTo(saveForm(seed, ann.id, q1.id));

    // Then the saved solution stays
    expect(await solutionOf()).toBe("the model solution");

    // When the teacher clears the solution box and saves
    await redirectedTo(saveForm(seed, ann.id, q1.id, { solution: "" }));

    // Then the solution is gone
    expect(await solutionOf()).toBeNull();
  });

  it("goes back to her earlier answer that needs a grade once her later answers are graded", async () => {
    // Given Ann's Q2 and Q3 are graded and Q1 still waits
    const seed = await seedTest(["written", "written", "written"]);
    const ann = await seedHandedInStudent(seed, "Ann", { graded: [1] });
    const [q1, , q3] = seed.questions;

    // When the teacher saves Q3 with Save & next
    const url = await redirectedTo(saveForm(seed, ann.id, q3.id));

    // Then Q1 opens on the same student
    expect(url.searchParams.get("studentId")).toBe(ann.id);
    expect(url.searchParams.get("questionId")).toBe(q1.id);
  });

  it("when this student has nothing left, opens the first answer that needs a grade of the oldest waiting student, never a graded, still-writing or choice one", async () => {
    // Given Ann is the last answer to grade for herself; Bob is fully graded; Cy and Dee wait; Eve is still writing
    const seed = await seedTest(["written", "written"]);
    const ann = await seedHandedInStudent(seed, "Ann", { graded: [1] });
    await seedHandedInStudent(seed, "Bob", { graded: [0, 1] });
    const cy = await seedHandedInStudent(seed, "Cy", { graded: [0] });
    await seedHandedInStudent(seed, "Dee");
    await seedHandedInStudent(seed, "Eve", { stillWriting: true });
    const [q1, q2] = seed.questions;

    // When the teacher saves Ann's Q1 with Save & next
    const url = await redirectedTo(saveForm(seed, ann.id, q1.id));

    // Then Cy (handed in before Dee) opens at Q2, his only answer still without a grade
    expect(url.searchParams.get("studentId")).toBe(cy.id);
    expect(url.searchParams.get("questionId")).toBe(q2.id);
  });

  it("stays on the saved answer when nothing in the test is left to grade", async () => {
    // Given Ann's Q1 is the only answer in the test without a grade
    const seed = await seedTest(["written", "written"]);
    const ann = await seedHandedInStudent(seed, "Ann", { graded: [1] });
    const [q1] = seed.questions;

    // When the teacher saves it with Save & next
    const url = await redirectedTo(saveForm(seed, ann.id, q1.id));

    // Then the same answer stays open
    expect(url.searchParams.get("studentId")).toBe(ann.id);
    expect(url.searchParams.get("questionId")).toBe(q1.id);
  });

  it("by question: opens the next student's answer to the same question that needs a grade, then the next question's", async () => {
    // Given Ann, Bob and Cy answered both questions; Bob's Q1 is already graded
    const seed = await seedTest(["written", "written"]);
    const ann = await seedHandedInStudent(seed, "Ann");
    await seedHandedInStudent(seed, "Bob", { graded: [0] });
    const cy = await seedHandedInStudent(seed, "Cy");
    const [q1, q2] = seed.questions;
    const byQuestion = { mode: "question" };

    // When the teacher saves Ann's Q1
    const nextStudent = await redirectedTo(
      saveForm(seed, ann.id, q1.id, byQuestion),
    );

    // Then Cy's Q1 opens (Bob's is graded), staying in By question
    expect(nextStudent.searchParams.get("mode")).toBe("question");
    expect(nextStudent.searchParams.get("studentId")).toBe(cy.id);
    expect(nextStudent.searchParams.get("questionId")).toBe(q1.id);

    // When Cy's Q1 is saved too, Q1 has nothing left
    const nextQuestion = await redirectedTo(
      saveForm(seed, cy.id, q1.id, byQuestion),
    );

    // Then the first waiting answer of Q2 in the screen's student order (newest enrolment first) opens: Cy's
    expect(nextQuestion.searchParams.get("studentId")).toBe(cy.id);
    expect(nextQuestion.searchParams.get("questionId")).toBe(q2.id);
  });
});

/** Seeds an AI suggestion for one answer, as an AI grading round leaves it. */
async function seedSuggestion(
  db: Db,
  seed: Seed,
  studentId: string,
  questionId: string,
) {
  await db.collection<AiGradeSuggestionDocument>("ai_grade").insertOne({
    id: "sugg-1",
    testId: seed.test.id,
    questionId,
    studentId,
    score: 70,
    feedback: "AI feedback",
    gradedAgainstAnswerId: "answer-1",
    model: AI_MODEL_NAME,
    gradedBy: AI_GRADER_ID,
    generatedByAdminId: "admin-1",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    regenerateReason: null,
    appliedAt: null,
    appliedBy: null,
  });
}

describe("Feature: a teacher's own grade on an AI-graded answer records how far it is from the AI's", () => {
  let db: Db;
  let exporter: InMemorySpanExporter;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
    exporter = new InMemorySpanExporter();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
  });

  afterEach(async () => {
    trace.disable();
    await teardownTestDb();
    vi.clearAllMocks();
  });

  /** The attributes of the Save & next span the last save recorded. */
  function saveSpanAttributes() {
    return exporter
      .getFinishedSpans()
      .find((span) => span.name === "action.saveAndNextAction")?.attributes;
  }

  it("records the AI's score next to the teacher's, the gap, and which texts differ", async () => {
    // Given the AI suggested 70 with its own feedback for Ann's Q1
    const seed = await seedTest(["written"]);
    const ann = await seedHandedInStudent(seed, "Ann");
    await seedSuggestion(db, seed, ann.id, seed.questions[0].id);

    // When the teacher saves 85 with her own feedback
    await redirectedTo(saveForm(seed, ann.id, seed.questions[0].id));

    // Then the save records how her grade compares with the AI's
    expect(saveSpanAttributes()).toMatchObject({
      "lms.ai.outcome": "manually_graded",
      "lms.ai.suggestion_score": 70,
      "lms.ai.final_score": 85,
      "lms.ai.score_gap": 15,
      "lms.ai.feedback_changed": true,
      "lms.ai.solution_changed": false,
    });
  });

  it("records nothing AI-related when the AI never suggested a grade for the answer", async () => {
    // Given Ann's Q1 has no AI suggestion
    const seed = await seedTest(["written"]);
    const ann = await seedHandedInStudent(seed, "Ann");

    // When the teacher saves it
    await redirectedTo(saveForm(seed, ann.id, seed.questions[0].id));

    // Then the save is recorded with no AI comparison
    const attributes = saveSpanAttributes();
    expect(attributes).toBeDefined();
    expect(
      Object.keys(attributes ?? {}).filter((key) => key.startsWith("lms.ai.")),
    ).toEqual([]);
  });
});
