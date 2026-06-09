import { revalidatePath } from "next/cache";
import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { StudentService } from "src/lib/student-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real services backed by a per-test Mongo.
vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// A real AuthService (for real registerStudent) is built per-test and exposed here.
const authHolder = vi.hoisted(() => ({ authService: null as unknown }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => authHolder.authService),
}));

import { ImportOutcome, PreviewStatus } from "../bulk-import.types";
import {
  bulkImportStudentsAction,
  previewImportAction,
} from "../bulk-import-actions";

const testConfig: AppConfig = {
  mongodbUri: "unused-in-test",
  authSecret: "test-secret",
  authAllowedHosts: ["localhost:3000"],
  google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
  s3: {
    bucket: "test-bucket",
    region: "ap-southeast-1",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  },
  adminEmails: [],
  trustedOrigins: [],
};

// Controllable admin gate, re-created each test.
let requireAdminSession: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const { db } = await setupTestDb();
  const authService = createAuthService(db, testConfig, new StudentService(db));
  requireAdminSession = vi
    .fn()
    .mockResolvedValue({ userId: "admin-1", role: "admin" });
  // Override the gate so each test controls admin pass/fail; keep real registerStudent.
  (
    authService as unknown as { requireAdminSession: unknown }
  ).requireAdminSession = requireAdminSession;
  authHolder.authService = authService;
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: Bulk import — teacher previews a roster", () => {
  it("classifies each row by create/skip reason without creating students", async () => {
    // Given an existing student "taken"
    const { studentService } = getTestServices();
    await studentService.createStudentDocument({
      authUserId: "auth-taken",
      username: "taken",
      name: "Already Here",
      createdBy: "admin",
    });

    // When previewing a roster covering every status
    const result = await previewImportAction([
      { name: "Alice", username: "alice", password: "secret123" }, // valid
      { name: "", username: "bob", password: "secret123" }, // missing-field
      { name: "Cara", username: "cara", password: "short" }, // password-too-short
      { name: "Dup One", username: "dup", password: "secret123" }, // dup-in-file
      { name: "Dup Two", username: "dup", password: "secret123" }, // dup-in-file
      { name: "Taker", username: "taken", password: "secret123" }, // already-exists
    ]);

    // Then each row carries its status and a summary, and nothing was written
    expect(result.success).toBe(true);
    expect(result.rows).toEqual([
      { name: "Alice", username: "alice", status: PreviewStatus.Valid },
      { name: "", username: "bob", status: PreviewStatus.MissingField },
      {
        name: "Cara",
        username: "cara",
        status: PreviewStatus.PasswordTooShort,
      },
      { name: "Dup One", username: "dup", status: PreviewStatus.DupInFile },
      { name: "Dup Two", username: "dup", status: PreviewStatus.DupInFile },
      { name: "Taker", username: "taken", status: PreviewStatus.AlreadyExists },
    ]);
    expect(result.summary).toEqual({ total: 6, valid: 1, skipped: 5 });

    // Read-only: only the pre-seeded student exists
    const all = await studentService.listStudents();
    expect(all).toHaveLength(1);
  });

  it("rejects a non-admin caller", async () => {
    // Given the session is not an admin
    requireAdminSession.mockRejectedValue(
      new Error("Unauthorized: admin access required"),
    );

    // When previewing
    const result = await previewImportAction([
      { name: "Alice", username: "alice", password: "secret123" },
    ]);

    // Then it is refused with no preview
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unauthorized");
    expect(result.rows).toBeUndefined();
  });

  it("rejects a roster larger than 200 rows", async () => {
    // Given 201 rows
    const rows = Array.from({ length: 201 }, (_, i) => ({
      name: `Student ${i}`,
      username: `user${i}`,
      password: "secret123",
    }));

    // When previewing
    const result = await previewImportAction(rows);

    // Then it is refused
    expect(result.success).toBe(false);
    expect(result.message).toContain("200");
    expect(result.rows).toBeUndefined();
  });
});

describe("Feature: Bulk import — teacher confirms the import", () => {
  it("creates valid students, enrolls them in selected courses, and reports per row", async () => {
    // Given an existing student "taken"
    const { studentService, enrollmentService } = getTestServices();
    await studentService.createStudentDocument({
      authUserId: "auth-taken",
      username: "taken",
      name: "Already Here",
      createdBy: "admin",
    });

    // When importing a mixed roster into one course
    const result = await bulkImportStudentsAction(
      [
        { name: "Alice", username: "alice", password: "secret123" }, // created
        { name: "Bob", username: "bob", password: "secret123" }, // created
        { name: "Cara", username: "cara", password: "short" }, // skipped: password-too-short
        { name: "Taker", username: "taken", password: "secret123" }, // skipped: already-exists
      ],
      ["course-1"],
    );

    // Then the per-row report and summary reflect each outcome
    expect(result.success).toBe(true);
    expect(result.report).toEqual([
      { username: "alice", outcome: ImportOutcome.Created },
      { username: "bob", outcome: ImportOutcome.Created },
      {
        username: "cara",
        outcome: ImportOutcome.Skipped,
        reason: PreviewStatus.PasswordTooShort,
      },
      {
        username: "taken",
        outcome: ImportOutcome.Skipped,
        reason: PreviewStatus.AlreadyExists,
      },
    ]);
    expect(result.summary).toEqual({ created: 2, skipped: 2, failed: 0 });

    // The two new students are persisted (plus the pre-seeded one)
    const all = await studentService.listStudents();
    expect(all).toHaveLength(3);

    // Both created students are enrolled in the selected course
    const createdIds = all
      .filter((s) => s.username === "alice" || s.username === "bob")
      .map((s) => s.id)
      .sort();
    const enrolledIds =
      await enrollmentService.listEnrollmentsByCourse("course-1");
    expect(enrolledIds.sort()).toEqual(createdIds);

    // The students list is revalidated
    expect(revalidatePath).toHaveBeenCalledWith("/admin/students");
  });

  it("enrolls created students into every selected course", async () => {
    // Given an empty system and two target courses
    const { studentService, enrollmentService } = getTestServices();

    // When importing two valid students into two courses
    const result = await bulkImportStudentsAction(
      [
        { name: "Alice", username: "alice", password: "secret123" },
        { name: "Bob", username: "bob", password: "secret123" },
      ],
      ["course-1", "course-2"],
    );

    // Then both students are created
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ created: 2, skipped: 0, failed: 0 });

    // And both are enrolled in each selected course
    const all = await studentService.listStudents();
    const createdIds = all.map((s) => s.id).sort();
    const courseOne =
      await enrollmentService.listEnrollmentsByCourse("course-1");
    const courseTwo =
      await enrollmentService.listEnrollmentsByCourse("course-2");
    expect(courseOne.sort()).toEqual(createdIds);
    expect(courseTwo.sort()).toEqual(createdIds);
  });

  it("reports a Failed outcome when registerStudent throws for a valid row", async () => {
    // Given registerStudent fails for the second valid row only
    const { studentService, enrollmentService } = getTestServices();
    const authService = authHolder.authService as {
      registerStudent: (input: {
        name: string;
        username: string;
        password: string;
        createdBy: string;
      }) => Promise<{ id: string; username: string; name: string }>;
    };
    const realRegister = authService.registerStudent.bind(authService);
    vi.spyOn(authService, "registerStudent").mockImplementation(
      async (input) => {
        if (input.username === "bob") {
          throw new Error("auth backend exploded");
        }
        return realRegister(input);
      },
    );

    // When importing two valid rows where the second errors
    const result = await bulkImportStudentsAction(
      [
        { name: "Alice", username: "alice", password: "secret123" }, // created
        { name: "Bob", username: "bob", password: "secret123" }, // fails
      ],
      ["course-1"],
    );

    // Then the failing row is reported as Failed with the thrown reason
    expect(result.success).toBe(true);
    expect(result.report).toEqual([
      { username: "alice", outcome: ImportOutcome.Created },
      {
        username: "bob",
        outcome: ImportOutcome.Failed,
        reason: "auth backend exploded",
      },
    ]);
    expect(result.summary).toEqual({ created: 1, skipped: 0, failed: 1 });

    // And only the successfully-created student is persisted and enrolled
    const all = await studentService.listStudents();
    expect(all).toHaveLength(1);
    expect(all[0].username).toBe("alice");
    const enrolled =
      await enrollmentService.listEnrollmentsByCourse("course-1");
    expect(enrolled).toEqual([all[0].id]);
  });

  it("rejects a non-admin caller and writes nothing", async () => {
    // Given the session is not an admin
    requireAdminSession.mockRejectedValue(
      new Error("Unauthorized: admin access required"),
    );

    // When importing
    const result = await bulkImportStudentsAction(
      [{ name: "Alice", username: "alice", password: "secret123" }],
      [],
    );

    // Then it is refused and no student is created
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unauthorized");
    const all = await getTestServices().studentService.listStudents();
    expect(all).toHaveLength(0);
  });
});
