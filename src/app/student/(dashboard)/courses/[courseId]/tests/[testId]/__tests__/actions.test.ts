import { revalidatePath } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";

const { requireStudentSession, isEnrolled, recordStart } = vi.hoisted(() => ({
  requireStudentSession: vi.fn(),
  isEnrolled: vi.fn(),
  recordStart: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireStudentSession })),
}));
vi.mock("src/lib/services-singleton", () => ({
  getEnrollmentService: vi.fn(async () => ({ isEnrolled })),
  getTestStartService: vi.fn(async () => ({ recordStart })),
}));

import { startTest } from "../actions";

function startFormData() {
  const fd = new FormData();
  fd.set("testId", "test-1");
  fd.set("courseId", "course-1");
  return fd;
}

describe("startTest action", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records a start for an enrolled student and revalidates the test page", async () => {
    // Given an enrolled student session.
    requireStudentSession.mockResolvedValueOnce({ studentId: "stu-1" });
    isEnrolled.mockResolvedValueOnce(true);
    recordStart.mockResolvedValueOnce(undefined);

    // When startTest is invoked.
    const result = await startTest(null, startFormData());

    // Then it succeeds, records a start for that student, and revalidates.
    expect(result.success).toBe(true);
    expect(recordStart).toHaveBeenCalledWith(
      "test-1",
      "stu-1",
      expect.any(Date),
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/student/courses/course-1/tests/test-1",
    );
  });

  it("rejects an unauthenticated caller and records no start", async () => {
    // Given no student session.
    requireStudentSession.mockRejectedValueOnce(new Error("no session"));

    // When startTest is invoked.
    const result = await startTest(null, startFormData());

    // Then it fails with a message and records no start.
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/unauthorized/i);
    expect(recordStart).not.toHaveBeenCalled();
  });

  it("rejects a student not enrolled in the course and records no start", async () => {
    // Given an authenticated student who is not enrolled.
    requireStudentSession.mockResolvedValueOnce({ studentId: "stu-1" });
    isEnrolled.mockResolvedValueOnce(false);

    // When startTest is invoked.
    const result = await startTest(null, startFormData());

    // Then it fails and records no start.
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not enrolled/i);
    expect(recordStart).not.toHaveBeenCalled();
  });

  it("succeeds on a repeated start (idempotency delegated to the service)", async () => {
    // Given an enrolled student who already started.
    requireStudentSession.mockResolvedValue({ studentId: "stu-1" });
    isEnrolled.mockResolvedValue(true);
    recordStart.mockResolvedValue(undefined);

    // When startTest is invoked twice.
    const first = await startTest(null, startFormData());
    const second = await startTest(null, startFormData());

    // Then both calls succeed (the action adds no extra guard).
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(recordStart).toHaveBeenCalledTimes(2);
  });
});
