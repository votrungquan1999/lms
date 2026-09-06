import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const dbIt = withTestDb(it);

const SCRIPTS_DIR = resolve(__dirname, "..");
const BACKFILL_SCRIPT = resolve(SCRIPTS_DIR, "backfill-user-roles.ts");

/**
 * Helper: run the backfill script against a given MONGODB_URI, optionally
 * with `--apply`.
 */
async function runBackfillScript(
  mongoUri: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "bun",
      [BACKFILL_SCRIPT, ...args],
      {
        env: { ...process.env, MONGODB_URI: mongoUri },
        cwd: SCRIPTS_DIR,
        timeout: 15000,
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

/**
 * Feature: the role backfill reports before it writes
 * As the operator
 * I want to see every account the backfill would promote to admin, with
 * nothing written, before anything actually changes
 * So that a real email address that slipped through the still-open signup
 * endpoint is never silently handed admin access (D17's safety rail)
 */
describe("Feature: the role backfill reports before it writes", () => {
  dbIt(
    "shows every real-email account it would promote to admin and writes nothing until --apply confirms it, applying exactly that classification and leaving already-roled accounts untouched",
    async ({ db, client }) => {
      // Given: a roleless real-email account (admin candidate), a roleless
      // synthetic-email account (pre-existing student), and an account that
      // already has a role recorded (must never be re-classified — D21).
      await db.collection("user").insertMany([
        { email: "owner@example.com", name: "Owner" },
        { email: "alice@lms.internal", name: "Alice" },
        { email: "bob@example.com", name: "Bob", role: "student" },
      ]);

      const mongoUri = `${client.options.hosts
        .map((h) => `mongodb://${h.host}:${h.port}`)
        .join(",")}/${db.databaseName}`;

      // When: the script runs without --apply
      const dryRun = await runBackfillScript(mongoUri);

      // Then: it exits cleanly, reports the admin candidate by email, and
      // writes nothing at all.
      expect(
        dryRun.exitCode,
        `Script failed:\nstdout: ${dryRun.stdout}\nstderr: ${dryRun.stderr}`,
      ).toBe(0);
      expect(dryRun.stdout).toContain("owner@example.com");

      const afterDryRun = await db.collection("user").find({}).toArray();
      expect(
        afterDryRun.find((u) => u.email === "owner@example.com")?.role,
      ).toBeUndefined();
      expect(
        afterDryRun.find((u) => u.email === "alice@lms.internal")?.role,
      ).toBeUndefined();
      expect(afterDryRun.find((u) => u.email === "bob@example.com")?.role).toBe(
        "student",
      );

      // When: the operator confirms with --apply
      const applied = await runBackfillScript(mongoUri, ["--apply"]);

      // Then: roleless accounts are classified by D17's rule, and the
      // already-roled account is untouched.
      expect(
        applied.exitCode,
        `Script failed:\nstdout: ${applied.stdout}\nstderr: ${applied.stderr}`,
      ).toBe(0);

      const afterApply = await db.collection("user").find({}).toArray();
      expect(
        afterApply.find((u) => u.email === "owner@example.com")?.role,
      ).toBe("admin");
      expect(
        afterApply.find((u) => u.email === "alice@lms.internal")?.role,
      ).toBe("student");
      expect(afterApply.find((u) => u.email === "bob@example.com")?.role).toBe(
        "student",
      );
    },
  );
});
