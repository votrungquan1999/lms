// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { CourseMaterial } from "src/lib/course-service";
import { describe, expect, it } from "vitest";
import { MaterialsSection } from "../materials-section";

/**
 * Builds a client-facing course material for rendering tests.
 */
function buildMaterial(
  overrides: Partial<CourseMaterial> = {},
): CourseMaterial {
  return {
    key: "materials/courses/c1/syllabus.pdf",
    contentType: "application/pdf",
    fileName: "syllabus.pdf",
    size: 1234,
    order: 0,
    uploadedAt: new Date("2026-01-01"),
    url: "https://files.example.com/syllabus.pdf",
    ...overrides,
  };
}

describe("MaterialsSection", () => {
  it("lists each uploaded material by file name", () => {
    // Given a course with one material
    render(
      <MaterialsSection
        courseId="c1"
        materials={[buildMaterial({ fileName: "syllabus.pdf" })]}
      />,
    );

    // Then the material's file name is shown
    expect(screen.getByText("syllabus.pdf")).toBeInTheDocument();
  });
});
