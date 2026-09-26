"use server";

import { SpanStatusCode, trace } from "@opentelemetry/api";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { z } from "zod";
import {
  DocumentFileType,
  DocumentReadFailure,
  type DocumentReadFailureReport,
} from "./document-read-failure";

/** Bounds what a caller can write into telemetry through this action. */
const documentReadFailureReportSchema = z.object({
  fileType: z.enum(DocumentFileType),
  fileSizeBytes: z.number().int().nonnegative(),
  reason: z.enum(DocumentReadFailure),
  errorName: z.string().max(100).optional(),
});

/**
 * Server action: records a document the browser failed to read, so failures
 * that never reach the AI still show up in telemetry. Ignores non-admin
 * callers and malformed reports — it is a public endpoint like any action.
 * @param report - The browser's report of the failed read.
 */
export async function reportDocumentReadFailureAction(
  report: DocumentReadFailureReport,
): Promise<void> {
  const authService = await getAuthService();
  try {
    await authService.requireAdminSession(await headers());
  } catch {
    return;
  }

  const parsed = documentReadFailureReportSchema.safeParse(report);
  if (!parsed.success) return;

  // The read already failed in the browser; this span only stands in for it.
  const span = trace.getTracer("lms").startSpan("document.read", {
    attributes: {
      "error.type": parsed.data.reason,
      "lms.import.file_type": parsed.data.fileType,
      "lms.import.file_size_bytes": parsed.data.fileSizeBytes,
      ...(parsed.data.errorName && {
        "lms.import.error_name": parsed.data.errorName,
      }),
    },
  });
  span.setStatus({ code: SpanStatusCode.ERROR, message: parsed.data.reason });
  span.end();
}
