import { RunnerCheckAction, RunnerEventKind } from "src/lib/ai/runner-event";
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

describe("Feature: a job keeps a bounded history of runner exchanges", () => {
  dbIt(
    "keeps only the newest 50 entries of a job whose runner status keeps flipping",
    async ({ db }) => {
      // Given a pending job
      const service = new AiGradeJobService(db, TEST_SCHOOL_ID);
      const job = await service.create(jobInput());

      // When 60 checks alternate between two statuses, each a change
      for (let i = 0; i < 60; i++) {
        await service.recordCheck(job.runnerJobId, {
          at: new Date(2026, 10, 24, 8, 0, i),
          kind: RunnerEventKind.Check,
          runnerJobId: job.runnerJobId,
          runnerStatus: i % 2 === 0 ? "running" : "unreachable",
          action: RunnerCheckAction.StillWaiting,
          savedCount: i,
        });
      }

      // Then the history holds the last 50, oldest first
      const latest = await service.getLatestForStudent("test-1", "student-1");
      expect(latest?.events).toHaveLength(50);
      expect(
        latest?.events.map((event) =>
          event.kind === RunnerEventKind.Check ? event.savedCount : null,
        ),
      ).toEqual(Array.from({ length: 50 }, (_, i) => i + 10));
    },
  );
});
