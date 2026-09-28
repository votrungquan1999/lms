// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { isValidElement, type ReactNode } from "react";
import { TooltipProvider } from "src/components/ui/tooltip";
import { AdminSession } from "src/lib/session";
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
