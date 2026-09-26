import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import {
  DocumentFileType,
  DocumentReadFailure,
  type DocumentReadFailureReport,
} from "../document-read-failure";
import { reportDocumentReadFailureAction } from "../read-failure-actions";

let exporter: InMemorySpanExporter;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    }),
  );
  requireAdminSession.mockReset().mockResolvedValue({ userId: "admin-1" });
});

afterEach(() => {
  trace.disable();
});

describe("Feature: a document the browser could not read shows up in telemetry", () => {
  it("records the failed read as an error span with the file type, size, reason and error name", async () => {
    await reportDocumentReadFailureAction({
      fileType: DocumentFileType.Pdf,
      fileSizeBytes: 2048,
      reason: DocumentReadFailure.ExtractionFailed,
      errorName: "InvalidPDFException",
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("document.read");
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.attributes).toEqual({
      "error.type": "extraction_failed",
      "lms.import.file_type": "pdf",
      "lms.import.file_size_bytes": 2048,
      "lms.import.error_name": "InvalidPDFException",
    });
  });

  it.each([
    {
      name: "the caller is not an admin",
      arrange: () =>
        requireAdminSession.mockRejectedValue(new Error("Unauthorized")),
      report: {
        fileType: "pdf",
        fileSizeBytes: 2048,
        reason: "no_text",
      },
    },
    {
      name: "the file type is not one the import accepts",
      arrange: () => {},
      report: { fileType: "exe", fileSizeBytes: 2048, reason: "no_text" },
    },
    {
      name: "the error name is oversized",
      arrange: () => {},
      report: {
        fileType: "pdf",
        fileSizeBytes: 2048,
        reason: "extraction_failed",
        errorName: "x".repeat(5000),
      },
    },
  ])("records nothing when $name", async ({ arrange, report }) => {
    arrange();

    await reportDocumentReadFailureAction(
      report as unknown as DocumentReadFailureReport,
    );

    expect(exporter.getFinishedSpans()).toEqual([]);
  });
});
