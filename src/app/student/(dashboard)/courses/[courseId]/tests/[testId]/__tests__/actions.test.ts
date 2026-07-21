import { revalidatePath } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";

const { requireStudentSession, isEnrolled, recordStart, submitAnswer } =
  vi.hoisted(() => ({
    requireStudentSession: vi.fn(),
    isEnrolled: vi.fn(),
    recordStart: vi.fn(),
    submitAnswer: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireStudentSession })),
}));
vi.mock("src/lib/services-singleton", () => ({
  getEnrollmentService: vi.fn(async () => ({ isEnrolled })),
  getTestStartService: vi.fn(async () => ({ recordStart })),
  getAnswerService: vi.fn(async () => ({ submitAnswer })),
}));

import { startTest, submitAnswerAction } from "../actions";

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

function submitImageFormData(mediaKeys: string[]) {
  const fd = new FormData();
  fd.set("testId", "test-1");
  fd.set("courseId", "course-1");
  fd.set("questionId", "q-1");
  fd.set("mediaKeys", JSON.stringify(mediaKeys));
  return fd;
}

describe("submitAnswerAction — image answer mediaKeys", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects mediaKeys outside the caller's own answers/<studentId>/ namespace and persists nothing", async () => {
    // Given an enrolled student who submits a key owned by another student.
    requireStudentSession.mockResolvedValue({ studentId: "stu-1" });
    isEnrolled.mockResolvedValue(true);

    // When submitting a foreign key alongside a valid own-namespace key.
    const result = await submitAnswerAction(
      null,
      submitImageFormData([
        "answers/stu-1/own-photo.jpg",
        "answers/victim-2/stolen-photo.jpg",
      ]),
    );

    // Then the submission is rejected and no answer is persisted — the IDOR
    // sink (a signed GET URL for the foreign key) is never reached.
    expect(result.success).toBe(false);
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it("rejects more than MAX_ANSWER_IMAGES photos (cap re-enforced on submit)", async () => {
    // Given an enrolled student who submits 4 own-namespace keys (cap is 3).
    requireStudentSession.mockResolvedValue({ studentId: "stu-1" });
    isEnrolled.mockResolvedValue(true);

    const result = await submitAnswerAction(
      null,
      submitImageFormData([
        "answers/stu-1/a.jpg",
        "answers/stu-1/b.jpg",
        "answers/stu-1/c.jpg",
        "answers/stu-1/d.jpg",
      ]),
    );

    // Then it is rejected and nothing is persisted.
    expect(result.success).toBe(false);
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it("accepts keys that all live under the caller's own namespace", async () => {
    // Given an enrolled student submitting their own valid photo keys.
    requireStudentSession.mockResolvedValue({ studentId: "stu-1" });
    isEnrolled.mockResolvedValue(true);
    submitAnswer.mockResolvedValue(undefined);

    const result = await submitAnswerAction(
      null,
      submitImageFormData(["answers/stu-1/a.jpg", "answers/stu-1/b.jpg"]),
    );

    // Then it succeeds and persists exactly those keys as an image answer.
    expect(result.success).toBe(true);
    expect(submitAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: {
          type: "image",
          mediaKeys: ["answers/stu-1/a.jpg", "answers/stu-1/b.jpg"],
        },
      }),
    );
  });
});
