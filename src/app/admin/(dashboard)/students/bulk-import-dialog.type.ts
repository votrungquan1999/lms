import type {
  ImportReportRow,
  ImportRowInput,
  PreviewRow,
} from "./bulk-import.types";

/** A course option shown in the optional enrollment picker. */
export interface CourseOption {
  id: string;
  title: string;
}

/** Which screen of the multi-stage dialog is showing. */
export enum ImportStage {
  Idle = "idle",
  Previewed = "previewed",
  Done = "done",
}

/** Full client state for the bulk-import dialog stage machine. */
export interface BulkImportState {
  stage: ImportStage;
  parsedRows: ImportRowInput[];
  preview: PreviewRow[];
  previewSummary: { total: number; valid: number; skipped: number } | null;
  selectedCourseIds: string[];
  report: ImportReportRow[];
  reportSummary: { created: number; skipped: number; failed: number } | null;
  formatError: string | null;
  actionError: string | null;
  isBusy: boolean;
}

/** Reducer actions driving the stage machine. */
export type BulkImportAction =
  | { type: "RESET" }
  | { type: "BUSY" }
  | { type: "FORMAT_ERROR"; message: string }
  | { type: "ACTION_ERROR"; message: string }
  | {
      type: "PREVIEW_READY";
      parsedRows: ImportRowInput[];
      preview: PreviewRow[];
      summary: { total: number; valid: number; skipped: number };
    }
  | { type: "TOGGLE_COURSE"; courseId: string }
  | {
      type: "REPORT_READY";
      report: ImportReportRow[];
      summary: { created: number; skipped: number; failed: number };
    };
