import type { Db } from "mongodb";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import { insertRawStudents } from "src/tests/raw-enrollment-seeds";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireStudentSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireStudentSession })),
}));

import { startTest, submitAnswerAction, submitTestAction } from "../actions";

let db: Db;

beforeEach(async () => {
  ({ db } = await setupTestDb());
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** Creates a course + test and a student enrolled in the course, all in the own school unless `schoolId` names another. */
async function seedOwnCourseAndTest(
  studentId: string,
  schoolId = TEST_SCHOOL_ID,
) {
  await insertRawStudents(db, [studentId], schoolId);
  const services = getTestServices(schoolId);
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
  await services.enrollmentService.enrollStudent(course.id, studentId, "admin");
  return { course, test };
}

function submitAnswerFormData(opts: {
  testId: string;
  courseId: string;
  questionId: string;
  answer: string;
}) {
  const fd = new FormData();
  fd.set("testId", opts.testId);
  fd.set("courseId", opts.courseId);
  fd.set("expectedSchoolId", TEST_SCHOOL_ID);
  fd.set("questionId", opts.questionId);
  fd.set("answer", opts.answer);
  return fd;
}

function testFormData(testId: string, courseId: string) {
  const fd = new FormData();
  fd.set("testId", testId);
  fd.set("courseId", courseId);
  fd.set("expectedSchoolId", TEST_SCHOOL_ID);
  return fd;
}

/**
 * Feature: a student can only start, answer and submit tests of the course
 * they're enrolled in
 * As a student enrolled in one course
 * I want a test id from another course or another school to be refused
 * So that pairing my own course with a foreign test can never reach it
 */
describe("Feature: a student can only act on tests of the course they're enrolled in", () => {
  it("submitAnswerAction refuses a test that belongs to a different course, and writes nothing", async () => {
    const { course } = await seedOwnCourseAndTest("student-1");
    // A second, unrelated course + test — never paired with `course`.
    const { test: foreignTest } = await seedOwnCourseAndTest("student-2");
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await submitAnswerAction(
      null,
      submitAnswerFormData({
        testId: foreignTest.id,
        courseId: course.id,
        questionId: "q-1",
        answer: "hello",
      }),
    );

    expect(result).toEqual({
      success: false,
      message: "You are not enrolled in this course",
    });
    const answers = await getTestServices().answerService.getLatestAnswers(
      foreignTest.id,
      "student-1",
    );
    expect(answers).toHaveLength(0);
  });

  it("submitAnswerAction refuses another school's test even when paired with the student's own course, and writes nothing", async () => {
    const { course } = await seedOwnCourseAndTest("student-1");
    const otherSchool = await addTestSchool("School B");
    const { test: foreignTest } = await seedOwnCourseAndTest(
      "student-b",
      otherSchool.id,
    );
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await submitAnswerAction(
      null,
      submitAnswerFormData({
        testId: foreignTest.id,
        courseId: course.id,
        questionId: "q-1",
        answer: "hello",
      }),
    );

    expect(result).toEqual({
      success: false,
      message: "You are not enrolled in this course",
    });
    const answers = await getTestServices(
      otherSchool.id,
    ).answerService.getLatestAnswers(foreignTest.id, "student-1");
    expect(answers).toHaveLength(0);
  });

  it("submitAnswerAction refuses a question that belongs to a different test in the student's own course, and writes nothing", async () => {
    const { course, test } = await seedOwnCourseAndTest("student-1");
    const services = getTestServices();
    // A second test in the SAME course: the test/course pairing and the
    // enrolment all pass, so only the question-in-test check can refuse.
    const otherTest = await services.testService.createTest(course.id, {
      title: "Other test",
      description: "",
      createdBy: "admin",
    });
    const foreignQuestion = await services.questionService.addQuestion(
      otherTest.id,
      {
        title: "Q",
        content: "Q",
        createdBy: "admin",
        type: "free_text",
      },
    );
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await submitAnswerAction(
      null,
      submitAnswerFormData({
        testId: test.id,
        courseId: course.id,
        questionId: foreignQuestion.id,
        answer: "hello",
      }),
    );

    expect(result).toEqual({ success: false, message: "Question not found" });
    const answers = await services.answerService.getLatestAnswers(
      test.id,
      "student-1",
    );
    expect(answers).toHaveLength(0);
  });

  it("startTest refuses a test that belongs to a different course, and records no start", async () => {
    const { course } = await seedOwnCourseAndTest("student-1");
    const { test: foreignTest } = await seedOwnCourseAndTest("student-2");
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await startTest(
      null,
      testFormData(foreignTest.id, course.id),
    );

    expect(result).toEqual({
      success: false,
      message: "You are not enrolled in this course",
    });
    const start = await getTestServices().testStartService.getActiveStart(
      foreignTest.id,
      "student-1",
    );
    expect(start).toBeNull();
  });

  it("startTest refuses another school's test even when paired with the student's own course, and records no start", async () => {
    const { course } = await seedOwnCourseAndTest("student-1");
    const otherSchool = await addTestSchool("School B");
    const { test: foreignTest } = await seedOwnCourseAndTest(
      "student-b",
      otherSchool.id,
    );
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await startTest(
      null,
      testFormData(foreignTest.id, course.id),
    );

    expect(result).toEqual({
      success: false,
      message: "You are not enrolled in this course",
    });
    const start = await getTestServices().testStartService.getActiveStart(
      foreignTest.id,
      "student-1",
    );
    expect(start).toBeNull();
  });

  it("submitTestAction refuses a test that belongs to a different course, and writes no submission", async () => {
    const { course } = await seedOwnCourseAndTest("student-1");
    const { test: foreignTest } = await seedOwnCourseAndTest("student-2");
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await submitTestAction(
      null,
      testFormData(foreignTest.id, course.id),
    );

    expect(result).toEqual({
      success: false,
      message: "You are not enrolled in this course",
    });
    const submitted =
      await getTestServices().testSubmissionService.isTestSubmitted(
        foreignTest.id,
        "student-1",
      );
    expect(submitted).toBe(false);
  });

  it("submitTestAction refuses another school's test even when paired with the student's own course, and writes no submission", async () => {
    const { course } = await seedOwnCourseAndTest("student-1");
    const otherSchool = await addTestSchool("School B");
    const { test: foreignTest } = await seedOwnCourseAndTest(
      "student-b",
      otherSchool.id,
    );
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await submitTestAction(
      null,
      testFormData(foreignTest.id, course.id),
    );

    expect(result).toEqual({
      success: false,
      message: "You are not enrolled in this course",
    });
    const submitted = await getTestServices(
      otherSchool.id,
    ).testSubmissionService.isTestSubmitted(foreignTest.id, "student-1");
    expect(submitted).toBe(false);
  });

  it("submitAnswerAction succeeds for a test that genuinely belongs to the student's own enrolled course", async () => {
    const { course, test } = await seedOwnCourseAndTest("student-1");
    const question = await getTestServices().questionService.addQuestion(
      test.id,
      {
        title: "Q",
        content: "Q",
        createdBy: "admin",
        type: "free_text",
      },
    );
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await submitAnswerAction(
      null,
      submitAnswerFormData({
        testId: test.id,
        courseId: course.id,
        questionId: question.id,
        answer: "hello",
      }),
    );

    expect(result).toEqual({
      success: true,
      message: "Answer submitted successfully",
    });
    const answers = await getTestServices().answerService.getLatestAnswers(
      test.id,
      "student-1",
    );
    expect(answers.map((a) => a.answer)).toEqual([
      { type: "free_text", text: "hello" },
    ]);
  });

  it("startTest records a start for a test of the student's own enrolled course", async () => {
    const { course, test } = await seedOwnCourseAndTest("student-1");
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await startTest(null, testFormData(test.id, course.id));

    expect(result).toEqual({ success: true, message: "Test started" });
    const start = await getTestServices().testStartService.getActiveStart(
      test.id,
      "student-1",
    );
    expect(start).not.toBeNull();
  });

  it("submitTestAction submits a test of the student's own enrolled course", async () => {
    const { course, test } = await seedOwnCourseAndTest("student-1");
    requireStudentSession.mockResolvedValue({
      studentId: "student-1",
      schoolId: TEST_SCHOOL_ID,
    });

    const result = await submitTestAction(
      null,
      testFormData(test.id, course.id),
    );

    expect(result).toEqual({
      success: true,
      message: "Test submitted for grading",
    });
    const submitted =
      await getTestServices().testSubmissionService.isTestSubmitted(
        test.id,
        "student-1",
      );
    expect(submitted).toBe(true);
  });
});
