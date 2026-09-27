// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CourseDetailPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

describe("Feature: CourseDetailPage X/Y graded badge links to grading", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render the graded count as a link to /admin/grading/[testId] when students are enrolled", async () => {
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
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
      name: "Stu",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    const ui = await CourseDetailPage({
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    const link = screen.getByRole("link", { name: /\d+\/\d+ graded/ });
    expect(link.getAttribute("href")).toBe(`/admin/grading/${test.id}`);
  });

  it("links to the results-report export view for the course", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });

    const ui = await CourseDetailPage({
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    const link = screen.getByRole("link", { name: /export results/i });
    expect(link.getAttribute("href")).toBe(
      `/admin/courses/${course.id}/results-report`,
    );
  });
});

describe("Feature: Course page always shows the Tests heading beside Add Test", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows a 'Tests (0)' heading next to Add Test even when the course has no tests yet", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });

    const ui = await CourseDetailPage({
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    const heading = screen.getByRole("heading", { name: "Tests (0)" });
    const addTestButton = screen.getByRole("button", { name: "Add Test" });
    expect(heading.parentElement).toContainElement(addTestButton);
  });

  it("styles the empty Tests message the same as its sibling empty sections, not centred", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });

    const ui = await CourseDetailPage({
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    expect(screen.getByText(/no tests yet/i).className).toBe(
      screen.getByText("No materials yet.").className,
    );
  });
});
