"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getEnrollmentService,
  getStudentService,
} from "src/lib/services-singleton";
import { z } from "zod";
import {
  ImportOutcome,
  type ImportReportRow,
  type ImportRowInput,
  type ImportState,
  type PreviewRow,
  type PreviewState,
  PreviewStatus,
} from "./bulk-import.types";

const MAX_IMPORT_ROWS = 200;

const importRowsSchema = z
  .array(
    z.object({
      name: z.string(),
      username: z.string(),
      password: z.string(),
    }),
  )
  .max(MAX_IMPORT_ROWS, `A maximum of ${MAX_IMPORT_ROWS} rows is allowed`);

/**
 * Classifies a single normalized row against in-file duplicates and existing usernames.
 * @param row - The trimmed row (name/username trimmed; password as-is).
 * @param usernameCounts - Occurrence count of each username within the batch.
 * @param existingUsernames - Usernames already present in the system.
 * @returns The first matching {@link PreviewStatus}.
 */
function classifyImportRow(
  row: ImportRowInput,
  usernameCounts: Map<string, number>,
  existingUsernames: Set<string>,
): PreviewStatus {
  if (!row.name || !row.username || !row.password) {
    return PreviewStatus.MissingField;
  }
  if (row.password.length < 8) {
    return PreviewStatus.PasswordTooShort;
  }
  if ((usernameCounts.get(row.username) ?? 0) > 1) {
    return PreviewStatus.DupInFile;
  }
  if (existingUsernames.has(row.username)) {
    return PreviewStatus.AlreadyExists;
  }
  return PreviewStatus.Valid;
}

/**
 * Normalizes and classifies a roster: trims name/username, counts in-file
 * duplicates, and runs a single existing-username query. Shared by preview and
 * confirm so both apply identical validation (confirm must never trust the client).
 * @param rows - Validated roster rows.
 * @returns The normalized rows paired with each row's {@link PreviewStatus}.
 */
async function classifyImportRows(
  rows: ImportRowInput[],
): Promise<{ normalized: ImportRowInput[]; statuses: PreviewStatus[] }> {
  // Trim name/username (mirrors createStudentAction); leave password as-is.
  const normalized: ImportRowInput[] = rows.map((row) => ({
    name: row.name.trim(),
    username: row.username.trim(),
    password: row.password,
  }));

  const usernameCounts = new Map<string, number>();
  for (const row of normalized) {
    if (row.username) {
      usernameCounts.set(
        row.username,
        (usernameCounts.get(row.username) ?? 0) + 1,
      );
    }
  }

  // Single batched existence query over rows that have a username.
  const candidateUsernames = normalized
    .filter((row) => row.name && row.username && row.password)
    .map((row) => row.username);
  const studentService = await getStudentService();
  const existingUsernames = new Set(
    await studentService.findExistingUsernames(candidateUsernames),
  );

  const statuses = normalized.map((row) =>
    classifyImportRow(row, usernameCounts, existingUsernames),
  );
  return { normalized, statuses };
}

/**
 * Previews a bulk-import roster: validates each row and reports whether it
 * would be created or skipped (and why), without writing anything.
 * @param rows - Parsed roster rows from the uploaded file.
 * @returns Per-row statuses and summary counts, or a failure state.
 */
export async function previewImportAction(
  rows: ImportRowInput[],
): Promise<PreviewState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = importRowsSchema.safeParse(rows);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  return await withSpan(
    "action.previewImportAction",
    {
      "lms.action.name": "previewImportAction",
      "lms.import.row_count": parsed.data.length,
    },
    async () => {
      const { normalized, statuses } = await classifyImportRows(parsed.data);

      const previewRows: PreviewRow[] = normalized.map((row, index) => ({
        name: row.name,
        username: row.username,
        status: statuses[index],
      }));

      const validCount = statuses.filter(
        (status) => status === PreviewStatus.Valid,
      ).length;

      return {
        success: true,
        message: "Preview ready",
        rows: previewRows,
        summary: {
          total: previewRows.length,
          valid: validCount,
          skipped: previewRows.length - validCount,
        },
      };
    },
  );
}

/**
 * Confirms a bulk import: re-validates rows server-side, sequentially creates
 * valid students, enrolls created students into each selected course, and
 * returns a per-row report. Partial success is expected (one failure does not
 * abort the rest).
 * @param rows - Parsed roster rows from the uploaded file.
 * @param courseIds - Course ids to enroll the created students into (may be empty).
 * @returns Per-row outcomes and summary counts, or a failure state.
 */
export async function bulkImportStudentsAction(
  rows: ImportRowInput[],
  courseIds: string[],
): Promise<ImportState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = importRowsSchema.safeParse(rows);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  return await withSpan(
    "action.bulkImportStudentsAction",
    {
      "lms.action.name": "bulkImportStudentsAction",
      "lms.import.row_count": parsed.data.length,
      "lms.import.course_count": courseIds.length,
    },
    async () => {
      // Re-validate server-side (never trust the client preview).
      const { normalized, statuses } = await classifyImportRows(parsed.data);

      const report: ImportReportRow[] = [];
      const createdStudentIds: string[] = [];

      for (let index = 0; index < normalized.length; index++) {
        const row = normalized[index];
        const status = statuses[index];

        if (status !== PreviewStatus.Valid) {
          report.push({
            username: row.username,
            outcome: ImportOutcome.Skipped,
            reason: status,
          });
          continue;
        }

        try {
          const student = await authService.registerStudent({
            name: row.name,
            username: row.username,
            password: row.password,
            createdBy: "admin",
          });
          createdStudentIds.push(student.id);
          report.push({
            username: row.username,
            outcome: ImportOutcome.Created,
          });
        } catch (error) {
          report.push({
            username: row.username,
            outcome: ImportOutcome.Failed,
            reason: error instanceof Error ? error.message : "Failed to create",
          });
        }
      }

      // Enroll all created students into each selected course (one call per course).
      const enrollmentService = await getEnrollmentService();
      for (const courseId of courseIds) {
        await enrollmentService.enrollStudents(
          courseId,
          createdStudentIds,
          "admin",
        );
      }

      revalidatePath("/admin/students");

      const created = report.filter(
        (r) => r.outcome === ImportOutcome.Created,
      ).length;
      const failed = report.filter(
        (r) => r.outcome === ImportOutcome.Failed,
      ).length;

      return {
        success: true,
        message: `Imported ${created} student${created === 1 ? "" : "s"}`,
        report,
        summary: { created, skipped: report.length - created - failed, failed },
      };
    },
  );
}
