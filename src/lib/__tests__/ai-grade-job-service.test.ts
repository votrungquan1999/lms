import {
  AiGradeJobService,
  AiGradeJobStatus,
  AiGradeJobTrigger,
  type CreateAiGradeJobInput,
} from "src/lib/ai-grade-job-service";
import { ensureIndexes } from "src/lib/database";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
import { describe, expect, it, vi } from "vitest";

const dbIt = withTestDb(it);

/** A valid job input; tests override what they care about. */
function jobInput(
  overrides: Partial<CreateAiGradeJobInput> = {},
): CreateAiGradeJobInput {
  return {
    courseId: "course-1",
    testId: "test-1",
    studentId: "student-1",
    questionId: null,
    trigger: AiGradeJobTrigger.AutoGrade,
    runnerJobId: "0123456789abcdef01234567",
    candidates: [{ questionId: "q-1", answerId: "a-1" }],
    reason: null,
    includeGraded: false,
    byAdminId: "admin-1",
    ...overrides,
  };
}

describe("Feature: AiGradeJobService stores one pending job per submission", () => {
  dbIt("returns the newest job for a student on a test", async ({ db }) => {
    // Two creates can share a millisecond, so the clock steps explicitly.
    const now = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date("2026-11-24T08:00:00Z"))
      .mockReturnValueOnce(new Date("2026-11-24T08:00:05Z"));
    const service = new AiGradeJobService(db, TEST_SCHOOL_ID, now);
    await service.create(jobInput({ runnerJobId: "aaaaaaaaaaaaaaaaaaaaaaaa" }));
    const newest = await service.create(
      jobInput({ runnerJobId: "bbbbbbbbbbbbbbbbbbbbbbbb" }),
    );

    const latest = await service.getLatestForStudent("test-1", "student-1");

    expect(latest?.id).toBe(newest.id);
    expect(latest?.status).toBe(AiGradeJobStatus.Pending);
  });

  dbIt(
    "refuses a second pending job for the same submission",
    async ({ db }) => {
      await ensureIndexes(db);
      const service = new AiGradeJobService(db, TEST_SCHOOL_ID);
      await service.create(
        jobInput({ runnerJobId: "aaaaaaaaaaaaaaaaaaaaaaaa" }),
      );

      await expect(
        service.create(jobInput({ runnerJobId: "bbbbbbbbbbbbbbbbbbbbbbbb" })),
      ).rejects.toMatchObject({ code: 11000 });
    },
  );
});
