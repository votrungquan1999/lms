// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { CourseMaterial } from "src/lib/course-service";
import { describe, expect, it } from "vitest";
import { MaterialsList } from "../materials-list";

/** Builds a client-facing course material for rendering tests. */
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

describe("MaterialsList (student)", () => {
  it("shows each material as a download link to its file", () => {
    // Given a course with one downloadable material
    render(
      <MaterialsList
        materials={[
          buildMaterial({
            fileName: "syllabus.pdf",
            url: "https://files.example.com/syllabus.pdf",
          }),
        ]}
      />,
    );

    // Then the student sees a link to download it
    const link = screen.getByRole("link", { name: "syllabus.pdf" });
    expect(link).toHaveAttribute(
      "href",
      "https://files.example.com/syllabus.pdf",
    );
  });
});
