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
    await enrolledStudent(courseId, "Idle");
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
    expect(await res.json()).toEqual({
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
