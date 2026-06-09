/**
 * Shared types for the bulk student import flow (preview + confirm).
 * Kept out of the `"use server"` action module so non-function values (enums)
 * can be exported safely.
 */

/** A single parsed roster row submitted for preview/import. */
export interface ImportRowInput {
  name: string;
  username: string;
  password: string;
}

/** Why a row will or will not be created on import. */
export enum PreviewStatus {
  Valid = "valid",
  MissingField = "missing-field",
  PasswordTooShort = "password-too-short",
  DupInFile = "dup-in-file",
  AlreadyExists = "already-exists",
}

/** A row's preview classification (password is never echoed back). */
export interface PreviewRow {
  name: string;
  username: string;
  status: PreviewStatus;
}

/** Result of previewing a roster: per-row statuses plus summary counts. */
export interface PreviewState {
  success: boolean;
  message: string;
  rows?: PreviewRow[];
  summary?: { total: number; valid: number; skipped: number };
}

/** Outcome of attempting to import a single row. */
export enum ImportOutcome {
  Created = "created",
  Skipped = "skipped",
  Failed = "failed",
}

/** Per-row result of a bulk import. */
export interface ImportReportRow {
  username: string;
  outcome: ImportOutcome;
  reason?: string;
}

/** Result of a bulk import: per-row report plus summary counts. */
export interface ImportState {
  success: boolean;
  message: string;
  report?: ImportReportRow[];
  summary?: { created: number; skipped: number; failed: number };
}
