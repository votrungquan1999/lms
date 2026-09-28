// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { isValidElement, type ReactNode } from "react";
import { TooltipProvider } from "src/components/ui/tooltip";
import { AdminSession } from "src/lib/session";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManageEnrollmentsDialog } from "../courses/[courseId]/enroll-student-form";
import CourseDetailPage from "../courses/[courseId]/page";
import ResultsReportPage from "../courses/[courseId]/results-report/page";
import { ResultsReportSelectionProvider } from "../courses/[courseId]/results-report/results-report-selection.state";
import { ComposeFromPoolsForm } from "../courses/[courseId]/tests/[testId]/compose-from-pools-form";
import TestGradingPage from "../courses/[courseId]/tests/[testId]/grading/page";
import TestDetailPage from "../courses/[courseId]/tests/[testId]/page";
import CoursesPage from "../courses/page";
import AdminDashboardPage from "../dashboard/page";
import GradingHubPage from "../grading/page";
import JoinRequestsPage from "../join-requests/page";
import PoolsPage from "../pools/page";
import { BulkImportDialog } from "../students/bulk-import-dialog";
import StudentsPage from "../students/page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

/** Finds the props a server component's output passes to `component`. */
function propsPassedTo<P>(node: ReactNode, component: unknown): P | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsPassedTo<P>(child, component);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === component) return node.props as P;
  const { children } = node.props as { children?: ReactNode };
  return propsPassedTo<P>(children, component);
}

/**
 * Signs in as the admin of a new, NON-default school, so a getter that falls
 * back to the default school shows the foreign data seeded there and fails.
 */
async function signInAsOtherSchoolAdmin(): Promise<{
  id: string;
  name: string;
}> {
  const school = await addTestSchool("School B");
  signInAs(
    new AdminSession({
      userId: "0000000000000000000000b1",
      email: "school-b-admin@example.com",
      school,
    }),
  );
  return school;
}

/**
 * Feature: a school admin's lists show only their current school's courses
 * As a school admin working in one school
 * I want every course list and picker to show only that school's courses
 * So that another school's courses never appear in my work
 */
describe("Feature: a school admin's lists show only their current school's courses", () => {
  beforeEach(async () => {
    await setupTestDb();
    const school = await signInAsOtherSchoolAdmin();
    await getTestServices().courseService.createCourse({
      title: "Foreign Course",
      description: "",
      createdBy: "default-school-admin",
    });
    await getTestServices(school.id).courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "school-b-admin",
    });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("the courses page lists only the current school's courses", async () => {
    render(await CoursesPage());

    expect(screen.getByText("Own Course")).toBeInTheDocument();
    expect(screen.queryByText("Foreign Course")).not.toBeInTheDocument();
  });

  it("the dashboard counts only the current school's courses", async () => {
    const { container } = render(
      <TooltipProvider>{await AdminDashboardPage()}</TooltipProvider>,
    );

    const coursesCard = container.querySelector('a[href="/admin/courses"]');
    expect(coursesCard).not.toBeNull();
    expect(
      within(coursesCard as HTMLElement).getByText("1"),
    ).toBeInTheDocument();
  });

  it("the students page's bulk-import course picker offers only the current school's courses", async () => {
    const page = await StudentsPage();

    const picker = propsPassedTo<{ courses: { title: string }[] }>(
      page,
      BulkImportDialog,
    );
    expect(picker?.courses.map((course) => course.title)).toEqual([
      "Own Course",
    ]);
  });
});

/** Seeds a test in `schoolId` with one enrolled student waiting for a grade. */
async function seedTestWaitingForGrade(schoolId: string, title: string) {
  const services = getTestServices(schoolId);
  const course = await services.courseService.createCourse({
    title: `${title} Course`,
    description: "",
    createdBy: "seed",
  });
  const test = await services.testService.createTest(course.id, {
    title,
    description: "",
    createdBy: "seed",
  });
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q",
    content: "Q",
    createdBy: "seed",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${schoolId}`,
    username: `student-${schoolId}`,
    name: "Student",
    createdBy: "seed",
  });
  await services.enrollmentService.enrollStudent(course.id, student.id, "seed");
  await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "x" },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
}

/**
 * Feature: a school admin's grading views show only their current school's tests
 * As a school admin working in one school
 * I want the grading hub and dashboard to count only that school's tests
 * So that another school's tests never appear in my grading work
 */
describe("Feature: a school admin's grading views show only their current school's tests", () => {
  beforeEach(async () => {
    await setupTestDb();
    const school = await signInAsOtherSchoolAdmin();
    await seedTestWaitingForGrade(TEST_SCHOOL_ID, "Foreign Test");
    await seedTestWaitingForGrade(school.id, "Own Test");
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("the grading hub lists only the current school's tests", async () => {
    render(await GradingHubPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Own Test")).toBeInTheDocument();
    expect(screen.queryByText("Foreign Test")).not.toBeInTheDocument();
  });

  it("the dashboard counts only the current school's tests needing grading", async () => {
    const { container } = render(
      <TooltipProvider>{await AdminDashboardPage()}</TooltipProvider>,
    );

    const count = container.querySelector(
      '[data-stat="tests-needing-grading"]',
    );
    expect(count?.textContent).toBe("1");
  });
});

/**
 * Feature: a school admin's lists show only their current school's students
 * As a school admin working in one school
 * I want every student list, count and picker to show only that school's students
 * So that another school's students never appear in my work
 */
describe("Feature: a school admin's lists show only their current school's students", () => {
  let schoolId: string;
  let ownCourseId: string;
  let ownStudentId: string;
  let foreignStudentId: string;

  beforeEach(async () => {
    await setupTestDb();
    const school = await signInAsOtherSchoolAdmin();
    schoolId = school.id;
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "school-b-admin",
    });
    ownCourseId = course.id;
    // Seeded through the default school's services, so a getter that falls
    // back to the default school shows the foreign student and fails the row.
    const foreign =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-foreign",
        username: "foreign.student",
        name: "Foreign Student",
        createdBy: "default-school-admin",
      });
    const ownStudent = await own.studentService.createStudentDocument({
      authUserId: "auth-own",
      username: "own.student",
      name: "Own Student",
      createdBy: "school-b-admin",
    });
    // Enrolled in the own course too, so a roster built from enrolments alone
    // would still show the foreign student.
    await own.enrollmentService.enrollStudent(course.id, foreign.id, "seed");
    await own.enrollmentService.enrollStudent(course.id, ownStudent.id, "seed");
    ownStudentId = ownStudent.id;
    foreignStudentId = foreign.id;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("the students page lists only the current school's students", async () => {
    render(await StudentsPage());

    expect(screen.getByText("Own Student")).toBeInTheDocument();
    expect(screen.queryByText("Foreign Student")).not.toBeInTheDocument();
  });

  it("the dashboard counts only the current school's students", async () => {
    const { container } = render(
      <TooltipProvider>{await AdminDashboardPage()}</TooltipProvider>,
    );

    const studentsCard = container.querySelector('a[href="/admin/students"]');
    expect(studentsCard).not.toBeNull();
    expect(
      within(studentsCard as HTMLElement).getByText("1"),
    ).toBeInTheDocument();
  });

  it("the course page's enrol-students picker offers only the current school's students", async () => {
    const page = await CourseDetailPage({
      params: Promise.resolve({ courseId: ownCourseId }),
    });

    const picker = propsPassedTo<{ students: { name: string }[] }>(
      page,
      ManageEnrollmentsDialog,
    );
    expect(picker?.students.map((student) => student.name)).toEqual([
      "Own Student",
    ]);
  });

  it("the results-report page offers only the current school's enrolled students", async () => {
    const page = await ResultsReportPage({
      params: Promise.resolve({ courseId: ownCourseId }),
    });

    const selection = propsPassedTo<{ students: { name: string }[] }>(
      page,
      ResultsReportSelectionProvider,
    );
    expect(selection?.students.map((student) => student.name)).toEqual([
      "Own Student",
    ]);
  });

  it("the course page's enrolled count and graded ratio count only the current school's students", async () => {
    await getTestServices(schoolId).testService.createTest(ownCourseId, {
      title: "Own Test",
      description: "",
      createdBy: "school-b-admin",
    });

    render(
      await CourseDetailPage({
        params: Promise.resolve({ courseId: ownCourseId }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Enrolled Students (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "0/1 graded" }),
    ).toBeInTheDocument();
  });

  it("the grading hub's fully-graded filter keeps a test every current-school student is graded on", async () => {
    const own = getTestServices(schoolId);
    const test = await own.testService.createTest(ownCourseId, {
      title: "Own Test",
      description: "",
      createdBy: "school-b-admin",
    });
    await own.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q",
      content: "Q",
      createdBy: "school-b-admin",
    });
    // A blank submission counts as fully graded.
    await own.testSubmissionService.submitTest(test.id, ownStudentId);

    render(
      await GradingHubPage({
        searchParams: Promise.resolve({ filter: "fully-graded" }),
      }),
    );

    expect(screen.getByText("Own Test")).toBeInTheDocument();
  });

  it("the grading page's enrolled header counts only the current school's students", async () => {
    const test = await getTestServices(schoolId).testService.createTest(
      ownCourseId,
      { title: "Own Test", description: "", createdBy: "school-b-admin" },
    );

    render(
      await TestGradingPage({
        params: Promise.resolve({ courseId: ownCourseId, testId: test.id }),
      }),
    );

    expect(screen.getByText(/^1 student enrolled/)).toBeInTheDocument();
  });

  it("the grading roster lists only the current school's enrolled students", async () => {
    const test = await getTestServices(schoolId).testService.createTest(
      ownCourseId,
      { title: "Own Test", description: "", createdBy: "school-b-admin" },
    );

    render(
      await TestGradingPage({
        params: Promise.resolve({ courseId: ownCourseId, testId: test.id }),
      }),
    );

    expect(
      screen.getByTestId(`roster-cell-${ownStudentId}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`roster-cell-${foreignStudentId}`),
    ).not.toBeInTheDocument();
  });
});

/**
 * Feature: a school admin's question pools show only their current school's pools
 * As a school admin working in one school
 * I want the question bank and the test page's pool picker to show only that school's pools
 * So that another school's pools never appear in my work
 */
describe("Feature: a school admin's question pools show only their current school's pools", () => {
  let schoolId: string;

  beforeEach(async () => {
    await setupTestDb();
    const school = await signInAsOtherSchoolAdmin();
    schoolId = school.id;
    await getTestServices().questionPoolService.createPool({
      name: "Foreign Pool",
      description: "",
      createdBy: "default-school-admin",
    });
    await getTestServices(school.id).questionPoolService.createPool({
      name: "Own Pool",
      description: "",
      createdBy: "school-b-admin",
    });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("the question bank lists only the current school's pools", async () => {
    render(await PoolsPage());

    expect(screen.getByText("Own Pool")).toBeInTheDocument();
    expect(screen.queryByText("Foreign Pool")).not.toBeInTheDocument();
  });

  it("the test page's pool picker offers only the current school's pools", async () => {
    const own = getTestServices(schoolId);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "school-b-admin",
    });
    const test = await own.testService.createTest(course.id, {
      title: "Own Test",
      description: "",
      createdBy: "school-b-admin",
    });

    const page = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });

    const picker = propsPassedTo<{ pools: { name: string }[] }>(
      page,
      ComposeFromPoolsForm,
    );
    expect(picker?.pools.map((pool) => pool.name)).toEqual(["Own Pool"]);
  });
});

/** Seeds a waiting join request in `schoolId` from a new student for a new course. */
async function seedWaitingJoinRequest(schoolId: string, label: string) {
  const services = getTestServices(schoolId);
  const course = await services.courseService.createCourse({
    title: `${label} Course`,
    description: "",
    createdBy: "seed",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${label}`,
    username: `${label.toLowerCase()}.student`,
    name: `${label} Student`,
    createdBy: "self-signup",
  });
  await services.courseJoinRequestService.createRequest({
    courseId: course.id,
    studentId: student.id,
  });
}

/**
 * Feature: a school admin's join-request queue shows only their current school's requests
 * As a school admin working in one school
 * I want the waiting join requests, and their count, to cover only that school
 * So that I never review or count another school's applicants
 */
describe("Feature: a school admin's join-request queue shows only their current school's requests", () => {
  beforeEach(async () => {
    await setupTestDb();
    const school = await signInAsOtherSchoolAdmin();
    await seedWaitingJoinRequest(TEST_SCHOOL_ID, "Foreign");
    await seedWaitingJoinRequest(school.id, "Own");
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("the join-requests page lists only the current school's waiting requests", async () => {
    render(await JoinRequestsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Own Student")).toBeInTheDocument();
    expect(screen.queryByText("Foreign Student")).not.toBeInTheDocument();
  });

  it("the join-requests page counts only the current school's waiting requests", async () => {
    render(await JoinRequestsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId("pagination-info").textContent).toBe(
      "Page 1 of 1 (1 total)",
    );
  });
});
