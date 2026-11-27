import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateGradingPaths } from "../revalidate-grading-paths";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Feature: a grading write refreshes every page that shows grading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes both grading routes and the To grade list", () => {
    revalidateGradingPaths("c1", "t1");

    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual([
      "/admin/courses/c1/tests/t1/grading",
      "/admin/grading/t1",
      "/admin/grading",
    ]);
  });

  it("also refreshes the pages a write names", () => {
    revalidateGradingPaths("c1", "t1", ["/student/courses/c1/tests/t1"]);

    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual([
      "/admin/courses/c1/tests/t1/grading",
      "/admin/grading/t1",
      "/admin/grading",
      "/student/courses/c1/tests/t1",
    ]);
  });
});
