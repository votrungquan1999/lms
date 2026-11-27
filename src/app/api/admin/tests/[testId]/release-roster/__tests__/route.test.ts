import { randomUUID } from "node:crypto";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import { GET } from "../route";

const ADMIN = "admin-1";

/** A course with one test of two single-choice questions and one free-text question. */
async function seedTest() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: ADMIN,
  });
  const test = await services.testService.createTest(course.id, {
    title: "Quiz",
    description: "",
    createdBy: ADMIN,
    showGradeAfterSubmit: false,
  });
  const freeText = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "c",
    createdBy: ADMIN,
  });
  for (const title of ["Q2", "Q3"]) {
    await services.questionService.addQuestion(test.id, {
      type: "single_select",
      title,
      content: "c",
      options: [
        { text: "Right", isCorrect: true },
        { text: "Wrong", isCorrect: false },
      ],
      createdBy: ADMIN,
    });
  }
  return { courseId: course.id, testId: test.id, freeTextId: freeText.id };
}

async function enrolledStudent(courseId: string, name: string) {
  const services = getTestServices();
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${randomUUID()}`,
    username: `u-${randomUUID().slice(0, 8)}`,
    name,
    createdBy: ADMIN,
  });
  await services.enrollmentService.enrollStudent(courseId, student.id, ADMIN);
  return student.id;
}

describe("release roster route", () => {
  let db: Awaited<ReturnType<typeof setupTestDb>>["db"];

  beforeEach(async () => {
    ({ db } = await setupTestDb());
    requireAdminSession.mockResolvedValue({
      userId: ADMIN,
      role: "admin",
      school: TEST_SCHOOL,
    });
  });
  afterEach(teardownTestDb);

  it("tells how the test's students stand and what the dialog may offer", async () => {
    // Given a test with one graded, one waiting and one not-started student
    const { courseId, testId, freeTextId } = await seedTest();
    const graded = await enrolledStudent(courseId, "Graded");
    const waiting = await enrolledStudent(courseId, "Waiting");
    const idle = await enrolledStudent(courseId, "Idle");
    for (const studentId of [graded, waiting]) {
      await db.collection("answer").insertOne({
        id: randomUUID(),
        testId,
        questionId: freeTextId,
        studentId,
        answer: { type: "free_text", text: "x" },
        submittedAt: new Date(),
      });
      await db.collection("test_submission").insertOne({
        id: randomUUID(),
        testId,
        studentId,
        submittedAt: new Date(),
        deletedAt: null,
        releasedAt: null,
        releasedBy: null,
      });
    }
    await db.collection("grade").insertOne({
      id: randomUUID(),
      testId,
      questionId: freeTextId,
      studentId: graded,
      score: 1,
      feedback: "",
      solution: null,
      gradedAt: new Date(),
      gradedBy: ADMIN,
      updatedAt: null,
      updatedBy: null,
    });

    // When the roster is asked for
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ testId }),
    });

    // Then it carries the counts, the correct-answers offer and the choice question count
    expect(res.status).toBe(200);
    const body = await res.json();
    // in the grading screen's picker order: waiting first, then graded, then not started
    expect(body.students).toEqual([
      expect.objectContaining({ id: waiting, status: "waiting" }),
      expect.objectContaining({ id: graded, status: "graded" }),
      expect.objectContaining({ id: idle, status: "not-started" }),
    ]);
    expect(body).toEqual({
      students: expect.any(Array),
      counts: {
        graded: 1,
        waiting: 1,
        stillWriting: 0,
        redoRequested: 0,
        notStarted: 1,
      },
      offerCorrectAnswers: false,
      choiceQuestionCount: 2,
    });
  });

  it("hands in nothing for a student whose timed attempt has run out, and is never cached", async () => {
    // Given a timed test where one student started two hours ago and never handed in
    const { courseId, testId, freeTextId } = await seedTest();
    await db
      .collection("test")
      .updateOne({ id: testId }, { $set: { timeLimitMinutes: 30 } });
    const lapsed = await enrolledStudent(courseId, "Lapsed");
    await db.collection("answer").insertOne({
      id: randomUUID(),
      testId,
      questionId: freeTextId,
      studentId: lapsed,
      answer: { type: "free_text", text: "x" },
      submittedAt: new Date(),
    });
    await getTestServices().testStartService.recordStart(
      testId,
      lapsed,
      new Date(Date.now() - 2 * 60 * 60_000),
    );

    // When the roster is asked for
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ testId }),
    });

    // Then she is listed as waiting for a grade, no hand-in was written for her, and the browser may not cache the answer
    const body = await res.json();
    expect(body.students).toEqual([
      expect.objectContaining({ id: lapsed, status: "waiting" }),
    ]);
    expect(
      await db.collection("test_submission").countDocuments({ testId }),
    ).toBe(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("lists a student with an open redo as redo requested", async () => {
    // Given a handed-in student whose teacher asked for a redo
    const { courseId, testId, freeTextId } = await seedTest();
    const redoing = await enrolledStudent(courseId, "Redoing");
    await db.collection("answer").insertOne({
      id: randomUUID(),
      testId,
      questionId: freeTextId,
      studentId: redoing,
      answer: { type: "free_text", text: "x" },
      submittedAt: new Date(),
    });
    await db.collection("test_submission").insertOne({
      id: randomUUID(),
      testId,
      studentId: redoing,
      submittedAt: new Date(),
      deletedAt: null,
      releasedAt: null,
      releasedBy: null,
    });
    await getTestServices().redoRequestService.requestRedo(
      testId,
      redoing,
      ADMIN,
    );

    // When the roster is asked for
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ testId }),
    });

    // Then she is counted as redo requested only
    const body = await res.json();
    expect(body.students).toEqual([
      expect.objectContaining({ id: redoing, status: "redo-requested" }),
    ]);
    expect(body.counts.redoRequested).toBe(1);
    expect(body.counts.graded).toBe(0);
  });

  it("answers 401 without an admin session", async () => {
    // Given no admin session
    const { testId } = await seedTest();
    requireAdminSession.mockRejectedValueOnce(
      new Error("Unauthorized: admin access required"),
    );

    // When the roster is asked for
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ testId }),
    });

    // Then it is refused
    expect(res.status).toBe(401);
  });

  it("answers the same 404 for a missing test and for another school's test", async () => {
    // Given a test of the default school and an admin of another school
    const { testId } = await seedTest();
    const other = await addTestSchool("School B");
    requireAdminSession.mockResolvedValue({
      userId: "admin-b",
      role: "admin",
      school: other,
    });

    // When that admin asks for the foreign test and for a test that does not exist
    const foreign = await GET(new Request("http://x"), {
      params: Promise.resolve({ testId }),
    });
    const missing = await GET(new Request("http://x"), {
      params: Promise.resolve({ testId: randomUUID() }),
    });

    // Then both answer 404 with the same body
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
  });
});
