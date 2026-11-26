// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResultsReportPage from "../page";

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

describe("Feature: Export results lists the course's students in a stable order", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lists students by name, however they were added", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    for (const name of ["Zed", "Amy", "Bob"]) {
      const student = await services.studentService.createStudentDocument({
        authUserId: `auth-${name}`,
        username: name.toLowerCase(),
        name,
        createdBy: "admin",
      });
      await services.enrollmentService.enrollStudent(
        course.id,
        student.id,
        "admin",
      );
    }

    render(
      await ResultsReportPage({
        params: Promise.resolve({ courseId: course.id }),
      }),
    );

    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.parentElement?.textContent)).toEqual([
      "Amy @amy",
      "Bob @bob",
      "Zed @zed",
    ]);
  });
});
