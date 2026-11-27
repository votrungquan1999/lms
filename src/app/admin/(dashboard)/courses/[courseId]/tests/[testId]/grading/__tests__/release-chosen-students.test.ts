import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { seedExpiredNeverHandedIn } from "src/tests/seed-expired-attempt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseTestAction } from "../actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

let db: Awaited<ReturnType<typeof setupTestDb>>["db"];

beforeEach(async () => {
  ({ db } = await setupTestDb());
  requireAdminSession.mockResolvedValue({
    userId: "admin-1",
    role: "admin",
    school: TEST_SCHOOL,
  });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** A course with one free-text test, ready for students to be added; correct answers hidden until released. */
async function seedTest() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin-1",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Quiz",
    description: "",
    createdBy: "admin-1",
    showCorrectAnswerAfterSubmit: false,
  });
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "c",
    createdBy: "admin-1",
  });
  return { services, courseId: course.id, testId: test.id, question };
}

type Seeded = Awaited<ReturnType<typeof seedTest>>;

/** An enrolled student who handed in and, when `graded`, has the question graded. */
async function addStudent(seeded: Seeded, name: string, graded: boolean) {
  const { services, courseId, testId, question } = seeded;
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${name}`,
    username: name.toLowerCase(),
    name,
    createdBy: "admin-1",
  });
  await services.enrollmentService.enrollStudent(
    courseId,
    student.id,
    "admin-1",
  );
  await services.answerService.submitAnswer({
    testId,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "an answer" },
  });
  await services.testSubmissionService.submitTest(testId, student.id);
  if (graded) {
    await services.gradeService.gradeQuestion({
      testId,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "",
      gradedBy: "admin-1",
    });
  }
  return student.id;
}

function chosenForm(seeded: Seeded, studentIds: string[]): FormData {
  const form = new FormData();
  form.set("mode", "chosen");
  form.set("testId", seeded.testId);
  form.set("courseId", seeded.courseId);
  for (const id of studentIds) form.append("studentId", id);
  return form;
}

async function releasedAt(seeded: Seeded, studentId: string) {
  const submission =
    await seeded.services.testSubmissionService.getActiveSubmission(
      seeded.testId,
      studentId,
    );
  return submission?.releasedAt ?? null;
}

describe("Feature: a teacher releases grades to chosen students", () => {
  it("releases every chosen graded student and nobody else", async () => {
    // Given three graded students
    const seeded = await seedTest();
    const ann = await addStudent(seeded, "Ann", true);
    const bo = await addStudent(seeded, "Bo", true);
    const cy = await addStudent(seeded, "Cy", true);

    // When the teacher releases to Ann and Bo
    const result = await releaseTestAction(null, chosenForm(seeded, [ann, bo]));

    // Then those two can see their grades and Cy cannot
    expect(result.success).toBe(true);
    expect(await releasedAt(seeded, ann)).toBeInstanceOf(Date);
    expect(await releasedAt(seeded, bo)).toBeInstanceOf(Date);
    expect(await releasedAt(seeded, cy)).toBeNull();
  });

  it("releases nobody and names the student when one chosen student is not graded", async () => {
    // Given Ann graded and Bo handed in but not graded
    const seeded = await seedTest();
    const ann = await addStudent(seeded, "Ann", true);
    const bo = await addStudent(seeded, "Bo", false);

    // When the teacher releases to both
    const result = await releaseTestAction(null, chosenForm(seeded, [ann, bo]));

    // Then it is refused, names Bo, and Ann's grade stays hidden too
    expect(result.success).toBe(false);
    expect(result.message).toBe("Nothing was released. Not graded: Bo");
    expect(await releasedAt(seeded, ann)).toBeNull();
    expect(await releasedAt(seeded, bo)).toBeNull();
  });

  it("releases nobody when one chosen student has an open redo", async () => {
    // Given Ann and Bo graded, and a redo requested from Bo
    const seeded = await seedTest();
    const ann = await addStudent(seeded, "Ann", true);
    const bo = await addStudent(seeded, "Bo", true);
    await seeded.services.redoRequestService.requestRedo(
      seeded.testId,
      bo,
      "admin-1",
    );

    // When the teacher releases to both
    const result = await releaseTestAction(null, chosenForm(seeded, [ann, bo]));

    // Then it is refused, names Bo, and nothing is released
    expect(result.success).toBe(false);
    expect(result.message).toBe("Nothing was released. Open redo: Bo");
    expect(await releasedAt(seeded, ann)).toBeNull();
    expect(await releasedAt(seeded, bo)).toBeNull();
  });

  it("releases the test's correct answers along with the chosen students' grades when ticked", async () => {
    // Given Ann and Bo graded, and correct answers hidden
    const seeded = await seedTest();
    const ann = await addStudent(seeded, "Ann", true);
    const bo = await addStudent(seeded, "Bo", true);
    const form = chosenForm(seeded, [ann]);
    form.set("alsoCorrectAnswers", "true");

    // When the teacher releases to Ann with "Also show correct answers"
    const result = await releaseTestAction(null, form);

    // Then Ann's grade and the test's correct answers are out, and Bo's grade stays hidden
    expect(result.success).toBe(true);
    expect(await releasedAt(seeded, ann)).toBeInstanceOf(Date);
    expect(await releasedAt(seeded, bo)).toBeNull();
    const test = await seeded.services.testService.getTest(seeded.testId);
    expect(test?.correctAnswersReleasedAt).toBeInstanceOf(Date);
  });

  it("keeps the correct answers hidden when the release is refused", async () => {
    // Given Ann graded, Bo not graded, and correct answers hidden
    const seeded = await seedTest();
    const ann = await addStudent(seeded, "Ann", true);
    const bo = await addStudent(seeded, "Bo", false);
    const form = chosenForm(seeded, [ann, bo]);
    form.set("alsoCorrectAnswers", "true");

    // When the teacher releases to both with "Also show correct answers"
    const result = await releaseTestAction(null, form);

    // Then nothing is released, the correct answers included
    expect(result.success).toBe(false);
    const test = await seeded.services.testService.getTest(seeded.testId);
    expect(test?.correctAnswersReleasedAt).toBeNull();
  });

  it("releases a student who redid the test, stamping only her active hand-in", async () => {
    // Given Ann handed in, was given a redo, handed in again and was graded
    const seeded = await seedTest();
    const { services, testId, question } = seeded;
    const ann = await addStudent(seeded, "Ann", true);
    await services.redoRequestService.requestRedo(testId, ann, "admin-1");
    await services.testSubmissionService.deleteSubmission(testId, ann);
    await services.redoRequestService.resolveRedoRequest(testId, ann);
    await services.answerService.submitAnswer({
      testId,
      questionId: question.id,
      studentId: ann,
      answer: { type: "free_text", text: "a second answer" },
    });
    await services.testSubmissionService.submitTest(testId, ann);
    await services.gradeService.gradeQuestion({
      testId,
      questionId: question.id,
      studentId: ann,
      score: 90,
      feedback: "",
      gradedBy: "admin-1",
    });

    // When the teacher releases to Ann
    const result = await releaseTestAction(null, chosenForm(seeded, [ann]));

    // Then her active hand-in is released and the deleted one is left untouched
    expect(result.success).toBe(true);
    const rows = await db
      .collection("test_submission")
      .find({ testId, studentId: ann })
      .toArray();
    expect(rows).toHaveLength(2);
    const active = rows.filter((row) => row.deletedAt == null);
    const deleted = rows.filter((row) => row.deletedAt != null);
    expect(active).toHaveLength(1);
    expect(active[0].releasedAt).toBeInstanceOf(Date);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].releasedAt ?? null).toBeNull();
  });

  it("releases a student whose expired timed attempt reads as graded, handing it in first", async () => {
    // Given a timed test whose student never handed in and whose time ran out
    const { course, test, student } = await seedExpiredNeverHandedIn(
      getTestServices(),
      db,
    );
    const form = new FormData();
    form.set("mode", "chosen");
    form.set("testId", test.id);
    form.set("courseId", course.id);
    form.append("studentId", student.id);

    // When the teacher releases to that student
    const result = await releaseTestAction(null, form);

    // Then the expired attempt is handed in and its grade is released
    expect(result.success).toBe(true);
    const submission =
      await getTestServices().testSubmissionService.getActiveSubmission(
        test.id,
        student.id,
      );
    expect(submission?.releasedAt).toBeInstanceOf(Date);
  });
});
