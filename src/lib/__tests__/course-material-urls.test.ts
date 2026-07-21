import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseMaterial } from "../course-service";
import { attachCourseMaterialUrls } from "../course-material-urls";

const mockGetPresignedDownloadUrl = vi.fn();
vi.mock("src/lib/services-singleton", () => ({
  getS3StorageService: () =>
    Promise.resolve({
      getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
    }),
}));

beforeEach(() => {
  mockGetPresignedDownloadUrl.mockReset();
  mockGetPresignedDownloadUrl.mockImplementation((key: string) =>
    Promise.resolve(`https://signed.example/${key}`),
  );
});

/** Builds a course material with an empty url. */
function material(overrides: Partial<CourseMaterial> = {}): CourseMaterial {
  return {
    key: "materials/courses/c1/a.pdf",
    contentType: "application/pdf",
    fileName: "a.pdf",
    size: 100,
    order: 0,
    uploadedAt: new Date("2026-01-01"),
    url: "",
    ...overrides,
  };
}

describe("attachCourseMaterialUrls", () => {
  it("mints an attachment download URL per material, forcing download by file name", async () => {
    // Given two stored materials with empty urls
    const input = [
      material({ key: "materials/courses/c1/a.pdf", fileName: "syllabus.pdf" }),
      material({
        key: "materials/courses/c1/b.docx",
        fileName: "notes.docx",
        order: 1,
      }),
    ];

    // When download URLs are minted
    const result = await attachCourseMaterialUrls(input);

    // Then each material carries a signed url
    expect(result[0].url).toBe("https://signed.example/materials/courses/c1/a.pdf");
    expect(result[1].url).toBe(
      "https://signed.example/materials/courses/c1/b.docx",
    );
    // And each was minted as a named attachment download
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "materials/courses/c1/a.pdf",
      undefined,
      { fileName: "syllabus.pdf" },
    );
    // And the input is not mutated
    expect(input[0].url).toBe("");
    expect(result[0]).not.toBe(input[0]);
  });
});
