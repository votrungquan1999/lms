// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CourseTabsLayout from "../(tabs)/layout";
import CourseDetailPage from "../(tabs)/page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

describe("Feature: the Tests tab counts hand-ins against the enrolled students", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows how many enrolled students handed in, and links the title to the test", async () => {
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

    expect(screen.getByText("0 of 1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Test" }).getAttribute("href"),
    ).toBe(`/admin/courses/${course.id}/tests/${test.id}`);
  });

  it("links to the results-report export view for the course", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });

    const ui = await CourseTabsLayout({
      children: null,
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    const link = screen.getByRole("link", { name: "Export results" });
    expect(link.getAttribute("href")).toBe(
      `/admin/courses/${course.id}/results-report`,
    );
  });
});

describe("Feature: Course page header offers New test on every tab", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows New test in the header even when the course has no tests yet", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });

    const ui = await CourseTabsLayout({
      children: null,
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    expect(
      screen.getByRole("button", { name: "New test" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 students · 0 tests")).toBeInTheDocument();
  });

  it("styles the empty Tests message like a quiet note", async () => {
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

    expect(screen.getByText(/no tests yet/i).className).toContain(
      "text-muted-foreground",
    );
  });
});
