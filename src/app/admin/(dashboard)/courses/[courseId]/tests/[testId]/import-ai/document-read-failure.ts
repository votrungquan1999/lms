/** Why the browser could not turn an uploaded document into text. */
export enum DocumentReadFailure {
  /** The parser library threw — damaged, locked, or unsupported file. */
  ExtractionFailed = "extraction_failed",
  /** It parsed, but held no text (e.g. a scanned PDF of images). */
  NoText = "no_text",
}

/** File types the import accepts. */
export enum DocumentFileType {
  Docx = "docx",
  Pdf = "pdf",
}

/**
 * What the browser reports about a failed document read. Never the file's
 * name or content — only enough to group and diagnose failures.
 */
export interface DocumentReadFailureReport {
  fileType: DocumentFileType;
  fileSizeBytes: number;
  reason: DocumentReadFailure;
  /** The thrown error's `name` (e.g. "InvalidPDFException"), when one was thrown. */
  errorName?: string;
}
