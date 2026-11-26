import { describe, expect, it } from "vitest";
import { formatFileSize } from "../format-file-size";

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [229, "229 B"],
    [1234, "1.2 KB"],
    [15 * 1024, "15 KB"],
    [5.5 * 1024 * 1024, "5.5 MB"],
    [10 * 1024 * 1024, "10 MB"],
    [1024, "1 KB"],
    [10_200, "10 KB"],
    [1_048_575, "1 MB"],
  ])("shows %i bytes as %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
