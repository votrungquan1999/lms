import { revalidatePath } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireStudentSession,
  isEnrolled,
  recordStart,
  submitAnswer,
  getTest,
  findByAuthUserId,
  submitTest,
} = vi.hoisted(() => ({
  requireStudentSession: vi.fn(),
  isEnrolled: vi.fn(),
  recordStart: vi.fn(),
  submitAnswer: vi.fn(),
  // Every action resolves the test first — own-course by default so the
  // file's existing happy-path rows keep passing.
  getTest: vi.fn(async () => ({ courseId: "course-1" })),
  submitTest: vi.fn(),
  findByAuthUserId: vi.fn(async () => ({
    schoolIds: ["school-a", "school-b"],
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireStudentSession })),
}));
vi.mock("src/lib/services-singleton", () => ({
  getEnrollmentService: vi.fn(async () => ({ isEnrolled })),
  getTestService: vi.fn(async () => ({ getTest })),
  getTestStartService: vi.fn(async () => ({ recordStart })),
  getAnswerService: vi.fn(async () => ({ submitAnswer })),
  getTestSubmissionService: vi.fn(async () => ({
    submitTest,
    deleteSubmission: vi.fn(),
  })),
  getRedoRequestService: vi.fn(async () => ({
    getActiveRedoRequest: vi.fn(async () => null),
    resolveRedoRequest: vi.fn(),
  })),
  getSchoolDirectory: vi.fn(async () => ({ findByAuthUserId })),
  getSchoolService: vi.fn(async () => ({
    listSchoolsForStudent: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        name: id === "school-a" ? "Alpha School" : "Beta School",
      })),
    ),
  })),
}));

import { startTest, submitAnswerAction, submitTestAction } from "../actions";

const STUDENT_IN_A = {
  userId: "user-1",
  studentId: "stu-1",
  schoolId: "school-a",
};

function startFormData() {
  const fd = new FormData();
  fd.set("testId", "test-1");
  fd.set("courseId", "course-1");
  fd.set("expectedSchoolId", "school-a");
  return fd;
}

describe("startTest action", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records a start for an enrolled student and revalidates the test page", async () => {
    // Given an enrolled student session.
    requireStudentSession.mockResolvedValueOnce(STUDENT_IN_A);
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

  it("refuses a start from a form opened in another school, naming that school, and records no start", async () => {
    // Given a form opened in Alpha while the student's active school is now Beta.
    requireStudentSession.mockResolvedValueOnce({
      ...STUDENT_IN_A,
      schoolId: "school-b",
    });

    // When startTest is invoked with the stale form.
    const result = await startTest(null, startFormData());

    // Then it is refused with the school to switch back to, and nothing is written.
    expect(result).toEqual({
      success: false,
      message:
        "Your active school changed — switch back to Alpha School to continue",
    });
    expect(recordStart).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a start that names no school, without naming one back", async () => {
    // Given a post with no expected-school field (old cached tab, crafted post).
    requireStudentSession.mockResolvedValueOnce(STUDENT_IN_A);
    const fd = startFormData();
    fd.delete("expectedSchoolId");

    // When startTest is invoked.
    const result = await startTest(null, fd);

    // Then it is refused with the copy that names no school.
    expect(result).toEqual({
      success: false,
      message: "Your active school changed — switch back to continue",
    });
    expect(recordStart).not.toHaveBeenCalled();
  });

  it("refuses a start from a form naming a school the student does not belong to, without naming it back", async () => {
    // Given a crafted post naming a school outside the student's schools.
    requireStudentSession.mockResolvedValueOnce({
      ...STUDENT_IN_A,
      schoolId: "school-b",
    });
    const fd = startFormData();
    fd.set("expectedSchoolId", "school-z");

    // When startTest is invoked.
    const result = await startTest(null, fd);

    // Then it is refused with the copy that names no school.
    expect(result).toEqual({
      success: false,
      message: "Your active school changed — switch back to continue",
    });
    expect(recordStart).not.toHaveBeenCalled();
  });

  it("starts again once the student switches back to the school the form was opened in", async () => {
    // Given the active school is Alpha again.
    requireStudentSession.mockResolvedValueOnce(STUDENT_IN_A);
    isEnrolled.mockResolvedValueOnce(true);

    // When the same form is posted.
    const result = await startTest(null, startFormData());

    // Then the start is recorded.
    expect(result.success).toBe(true);
    expect(recordStart).toHaveBeenCalledTimes(1);
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
    requireStudentSession.mockResolvedValueOnce(STUDENT_IN_A);
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
    requireStudentSession.mockResolvedValue(STUDENT_IN_A);
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
  fd.set("expectedSchoolId", "school-a");
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
    requireStudentSession.mockResolvedValue(STUDENT_IN_A);
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
    requireStudentSession.mockResolvedValue(STUDENT_IN_A);
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
    requireStudentSession.mockResolvedValue(STUDENT_IN_A);
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

function submitFreeTextFormData(answer: string) {
  const fd = new FormData();
  fd.set("testId", "test-1");
  fd.set("courseId", "course-1");
  fd.set("expectedSchoolId", "school-a");
  fd.set("questionId", "q-1");
  fd.set("answer", answer);
  return fd;
}

describe("submitAnswerAction — free_text blank guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a whitespace-only free_text answer without calling the answer service", async () => {
    // Given an enrolled student who submits only whitespace.
    requireStudentSession.mockResolvedValue(STUDENT_IN_A);
    isEnrolled.mockResolvedValue(true);

    // When submitting a whitespace-only answer.
    const result = await submitAnswerAction(
      null,
      submitFreeTextFormData("   "),
    );

    // Then it is rejected early — no round trip to the answer service.
    expect(result.success).toBe(false);
    expect(submitAnswer).not.toHaveBeenCalled();
  });
});

describe("submitAnswerAction — stale school tab", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses an answer from a form opened in another school, naming that school, and saves nothing", async () => {
    // Given a form opened in Alpha while the student's active school is now Beta.
    requireStudentSession.mockResolvedValueOnce({
      ...STUDENT_IN_A,
      schoolId: "school-b",
    });

    // When the stale form posts an answer.
    const result = await submitAnswerAction(
      null,
      submitFreeTextFormData("my answer"),
    );

    // Then it is refused with the school to switch back to, and nothing is saved.
    expect(result).toEqual({
      success: false,
      message:
        "Your active school changed — switch back to Alpha School to continue",
    });
    expect(submitAnswer).not.toHaveBeenCalled();
  });
});

describe("submitTestAction — stale school tab", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function submitTestFormData() {
    const fd = new FormData();
    fd.set("testId", "test-1");
    fd.set("courseId", "course-1");
    fd.set("expectedSchoolId", "school-a");
    return fd;
  }

  it("refuses a submit from a form opened in another school, naming that school, and submits nothing", async () => {
    // Given a form opened in Alpha while the student's active school is now Beta.
    requireStudentSession.mockResolvedValueOnce({
      ...STUDENT_IN_A,
      schoolId: "school-b",
    });

    // When the stale form posts the submission (a deadline auto-submit posts the same form).
    const result = await submitTestAction(null, submitTestFormData());

    // Then it is refused with the school to switch back to, and nothing is submitted.
    expect(result).toEqual({
      success: false,
      message:
        "Your active school changed — switch back to Alpha School to continue",
    });
    expect(submitTest).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("submits once the student is back in the school the form was opened in", async () => {
    // Given the active school is Alpha again and the student is enrolled.
    requireStudentSession.mockResolvedValueOnce(STUDENT_IN_A);
    isEnrolled.mockResolvedValueOnce(true);

    // When the same form is posted.
    const result = await submitTestAction(null, submitTestFormData());

    // Then the test is submitted for grading.
    expect(result.success).toBe(true);
    expect(submitTest).toHaveBeenCalledWith("test-1", "stu-1");
  });
});
