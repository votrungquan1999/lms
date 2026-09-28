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
import CoursesPage from "../courses/page";
import AdminDashboardPage from "../dashboard/page";
import GradingHubPage from "../grading/page";
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
 * Feature: a school admin's lists show only their current school's courses
 * As a school admin working in one school
 * I want every course list and picker to show only that school's courses
 * So that another school's courses never appear in my work
 */
describe("Feature: a school admin's lists show only their current school's courses", () => {
  beforeEach(async () => {
    await setupTestDb();
    // Acts as the NON-default school, so a getter that falls back to the
    // default school shows the foreign course and fails the row.
    const school = await addTestSchool("School B");
    signInAs(
      new AdminSession({
        userId: "0000000000000000000000b1",
        email: "school-b-admin@example.com",
        school,
      }),
    );
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
    schoolId,
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
    const school = await addTestSchool("School B");
    signInAs(
      new AdminSession({
        userId: "0000000000000000000000b1",
        email: "school-b-admin@example.com",
        school,
      }),
    );
    // Seeded through the default school's services, so a getter that falls
    // back to the default school shows the foreign test and fails the row.
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
