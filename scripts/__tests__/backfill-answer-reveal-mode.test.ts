import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const dbIt = withTestDb(it);

const SCRIPTS_DIR = resolve(__dirname, "..");
const BACKFILL_SCRIPT = resolve(SCRIPTS_DIR, "backfill-answer-reveal-mode.ts");

/**
 * Helper: run the backfill script with a custom MONGODB_URI.
 */
async function runBackfillScript(
  mongoUri: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("bun", [BACKFILL_SCRIPT], {
      env: { ...process.env, MONGODB_URI: mongoUri },
      cwd: SCRIPTS_DIR,
      timeout: 15000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

describe("backfill-answer-reveal-mode script", () => {
  dbIt(
    "backfills legacy rows missing or null answerRevealMode to diff, leaves an explicit value untouched, and is idempotent",
    async ({ db, client }) => {
      // Given: one row missing the field, one holding an explicit null (the
      // shape the pre-fix create-test.ts bug wrote), and one already migrated
      const legacy = { id: "legacy-test", title: "Legacy" };
      const legacyNull = {
        id: "legacy-null-test",
        title: "Legacy Null",
        answerRevealMode: null,
      };
      const migrated = {
        id: "migrated-test",
        title: "Migrated",
        answerRevealMode: "plain",
      };
      await db.collection("test").insertOne(legacy);
      await db.collection("test").insertOne(legacyNull);
      await db.collection("test").insertOne(migrated);

      const mongoUri = `${client.options.hosts
        .map((h) => `mongodb://${h.host}:${h.port}`)
        .join(",")}/${db.databaseName}`;

      // When: the script runs
      const result = await runBackfillScript(mongoUri);

      // Then: it exits successfully, reports both legacy rows backfilled,
      // and leaves the already-migrated row untouched
      expect(
        result.exitCode,
        `Script failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toBe(0);
      expect(result.stdout).toContain("backfilled 2 row(s)");
      const legacyAfter = await db
        .collection("test")
        .findOne({ id: "legacy-test" });
      const legacyNullAfter = await db
        .collection("test")
        .findOne({ id: "legacy-null-test" });
      const migratedAfter = await db
        .collection("test")
        .findOne({ id: "migrated-test" });
      expect(legacyAfter?.answerRevealMode).toBe("diff");
      expect(legacyNullAfter?.answerRevealMode).toBe("diff");
      expect(migratedAfter?.answerRevealMode).toBe("plain");

      // And: running it again is a no-op, proven by the script's own report
      const second = await runBackfillScript(mongoUri);
      expect(
        second.exitCode,
        `Script failed:\nstdout: ${second.stdout}\nstderr: ${second.stderr}`,
      ).toBe(0);
      expect(second.stdout).toContain("backfilled 0 row(s)");
    },
  );
});
