// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestDetailPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

/**
 * Feature: the test page's "Import Questions with AI" and "Grade Students"
 * links look like real buttons — both were hand-rolled `<Link>`s with
 * their own styling instead of the shared `Button`.
 */
describe("Feature: Import Questions with AI and Grade Students are real buttons", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("renders both links as Buttons, matching outline and default styling respectively", async () => {
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

    const ui = await TestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const importLink = screen.getByRole("link", {
      name: /import questions with ai/i,
    });
    const gradeLink = screen.getByRole("link", { name: /grade students/i });

    expect(importLink).toHaveAttribute("data-slot", "button");
    expect(importLink).toHaveAttribute("data-variant", "outline");
    expect(gradeLink).toHaveAttribute("data-slot", "button");
    expect(gradeLink).toHaveAttribute("data-variant", "default");
  });
});
