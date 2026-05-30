import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("TestStartService", () => {
  dbIt("records the start time on the first start", async ({ db }) => {
    // Given no recorded start for (testId, studentId).
    const { testStartService } = buildCoreServices(db);
    const t1 = new Date("2026-05-30T10:00:00.000Z");

    // When recordStart is called at a controlled time T1.
    await testStartService.recordStart("test-1", "student-1", t1);

    // Then the active start reads back startedAt === T1.
    const start = await testStartService.getActiveStart("test-1", "student-1");
    expect(start?.startedAt.getTime()).toBe(t1.getTime());
  });

  dbIt("never resets startedAt on a second start", async ({ db }) => {
    // Given a start already recorded at T1.
    const { testStartService } = buildCoreServices(db);
    const t1 = new Date("2026-05-30T10:00:00.000Z");
    const t2 = new Date("2026-05-30T10:45:00.000Z");
    await testStartService.recordStart("test-1", "student-1", t1);

    // When recordStart is called again at a later time T2.
    await testStartService.recordStart("test-1", "student-1", t2);

    // Then the recorded startedAt is still T1, not T2.
    const start = await testStartService.getActiveStart("test-1", "student-1");
    expect(start?.startedAt.getTime()).toBe(t1.getTime());
    expect(start?.startedAt.getTime()).not.toBe(t2.getTime());
  });

  dbIt("returns null when no start has been recorded", async ({ db }) => {
    // Given a (testId, studentId) that never started.
    const { testStartService } = buildCoreServices(db);

    // When the active-start accessor is queried.
    const start = await testStartService.getActiveStart("test-1", "student-1");

    // Then it returns null.
    expect(start).toBeNull();
  });

  dbIt("treats a soft-deleted start as inactive", async ({ db }) => {
    // Given a start record that has been soft-deleted (deletedAt set).
    const { testStartService } = buildCoreServices(db);
    const t1 = new Date("2026-05-30T10:00:00.000Z");
    await testStartService.recordStart("test-1", "student-1", t1);
    await db
      .collection("test_start")
      .updateOne(
        { testId: "test-1", studentId: "student-1" },
        { $set: { deletedAt: new Date(), deletedBy: "admin" } },
      );

    // When the active-start accessor is queried.
    const start = await testStartService.getActiveStart("test-1", "student-1");

    // Then it returns null (soft-deleted starts are not active).
    expect(start).toBeNull();
  });
});
