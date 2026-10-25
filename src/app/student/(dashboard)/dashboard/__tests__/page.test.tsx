// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { StudentSession } from "src/lib/session";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentDashboardPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: A student sees their school's name on their dashboard
 * As a student
 * I want my own school's name shown on my dashboard
 * So that I know which school's courses I'm looking at
 */
describe("Feature: Student dashboard shows the student's school name", () => {
  it("shows the name of the student's own school, not another school's", async () => {
    // A non-default school, so a page that named the default school fails.
    const school = await addTestSchool("Riverside High");
    const student = await getTestServices(
      school.id,
    ).studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "student-1",
      name: "Student One",
      createdBy: "self-signup",
    });
    signInAs(
      new StudentSession({
        userId: "auth-1",
        username: "student-1",
        studentId: student.id,
        schoolId: school.id,
      }),
    );

    render(await StudentDashboardPage());

    expect(
      screen.getByText((content) => content.includes("Riverside High")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((content) => content.includes(TEST_SCHOOL.name)),
    ).not.toBeInTheDocument();
  });
});

/**
 * Feature: A student in several schools sees only the active school's courses
 * As a student who belongs to two schools
 * I want the dashboard to list only the school I'm working in
 * So that another school's courses never leak into this one
 */
describe("Feature: Student dashboard shows only the active school's courses", () => {
  it("lists the active school's course and not the student's other school's", async () => {
    const schoolB = await addTestSchool("School B");
    const inDefault = getTestServices();
    const inB = getTestServices(schoolB.id);
    const student = await inDefault.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "student-1",
      name: "Student One",
      createdBy: "self-signup",
    });
    await inB.studentService.addToSchool(student.id);
    const defaultCourse = await inDefault.courseService.createCourse({
      title: "Default School Algebra",
      description: "",
      createdBy: "admin-1",
    });
    const bCourse = await inB.courseService.createCourse({
      title: "School B Geometry",
      description: "",
      createdBy: "admin-b",
    });
    await inDefault.enrollmentService.enrollStudent(
      defaultCourse.id,
      student.id,
      "admin-1",
    );
    await inB.enrollmentService.enrollStudent(
      bCourse.id,
      student.id,
      "admin-b",
    );
    signInAs(
      new StudentSession({
        userId: "auth-1",
        username: "student-1",
        studentId: student.id,
        schoolId: schoolB.id,
      }),
    );

    render(await StudentDashboardPage());

    expect(screen.getByText("School B Geometry")).toBeInTheDocument();
    expect(
      screen.queryByText("Default School Algebra"),
    ).not.toBeInTheDocument();
  });
});

/**
 * Feature: Student dashboard shows a pending join request
 * As a student waiting on admin approval to join a course
 * I want to be told my request is still pending
 * So that I know it wasn't lost, whether or not my course list is empty
 */
describe("Feature: Student dashboard shows a pending join request", () => {
  it("shows the pending notice even though the student is already enrolled in another course (R13)", async () => {
    const {
      courseService,
      studentService,
      enrollmentService,
      courseJoinRequestService,
    } = getTestServices();

    const student = await studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "student-1",
      name: "Student One",
      createdBy: "self-signup",
    });
    signInAs(
      new StudentSession({
        userId: "auth-1",
        username: "student-1",
        studentId: student.id,
        schoolId: TEST_SCHOOL_ID,
      }),
    );

    // Given the student is already enrolled in one course...
    const enrolledCourse = await courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin-1",
    });
    await enrollmentService.enrollStudent(
      enrolledCourse.id,
      student.id,
      "admin-1",
    );

    // ...and ALSO has a pending join request for a second course — the
    // course list is non-empty, so a notice hung off the empty state alone
    // would never fire here (R13)
    const otherCourse = await courseService.createCourse({
      title: "Geometry",
      description: "",
      createdBy: "admin-1",
    });
    await courseJoinRequestService.createRequest({
      courseId: otherCourse.id,
      studentId: student.id,
    });

    const ui = await StudentDashboardPage();
    render(ui);

    // Then the pending notice still appears
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });
});

/**
 * Feature: Student dashboard hides a Graded-but-withheld test from the
 * "Graded" count
 * As a student whose teacher hasn't released a test's grades
 * I want the dashboard summary to count it as awaiting grade, not graded
 * So that the headline numbers never say more than the teacher has released
 */
describe("Feature: Student dashboard — Graded-but-withheld tests count as awaiting grade", () => {
  /**
   * Seeds one enrolled course whose single free-text test the student has
   * submitted and the teacher has graded, with nothing released yet.
   */
  async function seedInternallyGradedTest() {
    const services = getTestServices();
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "student-1",
      name: "Student One",
      createdBy: "self-signup",
    });
    signInAs(
      new StudentSession({
        userId: "auth-1",
        username: "student-1",
        studentId: student.id,
        schoolId: TEST_SCHOOL_ID,
      }),
    );

    const course = await services.courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin-1",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin-1",
    );

    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin-1",
      showGradeAfterSubmit: false,
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin-1",
      type: "free_text",
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "Good",
      gradedBy: "admin-1",
    });
    return { services, test };
  }

  /** The number rendered just above a summary card's label. */
  function summaryValue(label: string) {
    return screen.getByText(label).previousElementSibling;
  }

  it("counts a Graded-but-withheld test toward 'Awaiting grade', not 'Graded'", async () => {
    // Internally Graded, but never released — none of the three reveal
    // tiers is open.
    await seedInternallyGradedTest();

    render(await StudentDashboardPage());

    expect(summaryValue("Graded")).toHaveTextContent("0");
    expect(summaryValue("Awaiting grade")).toHaveTextContent("1");
  });

  it("counts the test as 'Graded' once the teacher releases its grades", async () => {
    const { services, test } = await seedInternallyGradedTest();
    await services.testService.releaseGrades(test.id, "admin-1");

    render(await StudentDashboardPage());

    expect(summaryValue("Graded")).toHaveTextContent("1");
    expect(summaryValue("Awaiting grade")).toHaveTextContent("0");
  });
});
