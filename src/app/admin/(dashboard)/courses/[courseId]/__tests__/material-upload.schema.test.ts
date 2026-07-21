import { describe, expect, it } from "vitest";
import {
  MAX_MATERIAL_SIZE_BYTES,
  MaterialContentType,
  requestMaterialUploadSlotsSchema,
} from "../material-upload.schema";

describe("requestMaterialUploadSlotsSchema", () => {
  it("rejects an unsupported file type", () => {
    // Given a requested upload slot for an executable (not an allowed material type)
    const requested = [
      {
        fileName: "virus.exe",
        contentType: "application/x-msdownload",
        size: 1024,
      },
    ];

    // When the request is validated
    const result = requestMaterialUploadSlotsSchema.safeParse(requested);

    // Then it is rejected
    expect(result.success).toBe(false);
  });

  it("accepts a supported PDF within the size cap", () => {
    // Given a requested upload slot for a small PDF
    const requested = [
      {
        fileName: "syllabus.pdf",
        contentType: MaterialContentType.PDF,
        size: 1024,
      },
    ];

    // When the request is validated
    const result = requestMaterialUploadSlotsSchema.safeParse(requested);

    // Then it is accepted
    expect(result.success).toBe(true);
  });

  it("rejects a file larger than the size cap", () => {
    // Given a requested upload slot for an oversized PDF
    const requested = [
      {
        fileName: "huge.pdf",
        contentType: MaterialContentType.PDF,
        size: MAX_MATERIAL_SIZE_BYTES + 1,
      },
    ];

    // When the request is validated
    const result = requestMaterialUploadSlotsSchema.safeParse(requested);

    // Then it is rejected
    expect(result.success).toBe(false);
  });
});
