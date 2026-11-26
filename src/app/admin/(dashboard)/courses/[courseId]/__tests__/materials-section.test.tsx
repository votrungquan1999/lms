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

  it("shows the size and the Vietnam-time upload date beside the file", () => {
    // Given a material uploaded late evening UTC (already next day in Vietnam)
    render(
      <MaterialsSection
        courseId="c1"
        materials={[
          buildMaterial({
            size: 1234,
            uploadedAt: new Date("2026-09-02T18:30:00Z"),
          }),
        ]}
      />,
    );

    // Then the row shows both, and the download link names the file
    const row = screen.getByRole("row", { name: /syllabus\.pdf/ });
    expect(row).toHaveTextContent("1.2 KB");
    expect(row).toHaveTextContent("3 Sep 2026");
    expect(
      screen.getByRole("link", { name: "Download syllabus.pdf" }),
    ).toBeInTheDocument();
  });

  it("orders by position, then by upload time when two share a position", () => {
    // Given a re-added file that shares its position with an older one (the
    // position is the material count at upload, so a remove then add repeats it)
    render(
      <MaterialsSection
        courseId="c1"
        materials={[
          buildMaterial({
            key: "k-a",
            fileName: "newer.pdf",
            order: 1,
            uploadedAt: new Date("2026-03-02"),
          }),
          buildMaterial({
            key: "k-z",
            fileName: "older.pdf",
            order: 1,
            uploadedAt: new Date("2026-03-01"),
          }),
          buildMaterial({ key: "k-m", fileName: "first.pdf", order: 0 }),
        ]}
      />,
    );

    // Then the rows read by position, older upload first on the tie
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelector("td")?.textContent);
    expect(names).toEqual(["first.pdf", "older.pdf", "newer.pdf"]);
  });
});
