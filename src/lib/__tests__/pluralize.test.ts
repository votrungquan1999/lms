import { describe, expect, it } from "vitest";
import { pluralize } from "../pluralize";

describe("pluralize", () => {
  it("returns the singular form when the count is 1", () => {
    expect(pluralize(1, "student")).toBe("student");
  });

  it("returns the plural form when the count is not 1", () => {
    expect(pluralize(0, "student")).toBe("students");
    expect(pluralize(3, "student")).toBe("students");
  });
});
