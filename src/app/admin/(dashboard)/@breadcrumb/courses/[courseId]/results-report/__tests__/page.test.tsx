// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResultsReportBreadcrumb from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

describe("Feature: Export Results has a breadcrumb", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows Courses, a link to the course, and Export Results as the current page", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra I",
      description: "",
      createdBy: "admin",
    });

    const ui = await ResultsReportBreadcrumb({
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    expect(screen.getByRole("link", { name: "Courses" })).toHaveAttribute(
      "href",
      "/admin/courses",
    );
    const courseLink = screen.getByRole("link", { name: "Algebra I" });
    expect(courseLink).toHaveAttribute("href", `/admin/courses/${course.id}`);
    expect(screen.getByText("Export Results")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
