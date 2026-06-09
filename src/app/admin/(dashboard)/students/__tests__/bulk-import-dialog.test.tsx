// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportOutcome, PreviewStatus } from "../bulk-import.types";
import {
  bulkImportStudentsAction,
  previewImportAction,
} from "../bulk-import-actions";
import { BulkImportDialog } from "../bulk-import-dialog";
import { ParseImportErrorKind, parseImportFile } from "../parse-import-file";

vi.mock("../parse-import-file", () => ({
  parseImportFile: vi.fn(),
  ParseImportErrorKind: {
    Unreadable: "unreadable",
    MissingHeader: "missing-header",
    NoRows: "no-rows",
    TooManyRows: "too-many-rows",
  },
}));
vi.mock("../bulk-import-actions", () => ({
  previewImportAction: vi.fn(),
  bulkImportStudentsAction: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

const courses = [{ id: "c1", title: "Math 101" }];

const parsedRows = [
  { name: "Alice", username: "alice", password: "secret123" },
  { name: "Taker", username: "taken", password: "secret123" },
];

function makeFile(): File {
  return new File(["name,username,password\n"], "roster.csv", {
    type: "text/csv",
  });
}

describe("Feature: Bulk import — teacher onboards a class via the Students page", () => {
  it("walks upload → preview → course-picker → confirm → report", async () => {
    const user = userEvent.setup();
    vi.mocked(parseImportFile).mockResolvedValue({
      ok: true,
      rows: parsedRows,
    });
    vi.mocked(previewImportAction).mockResolvedValue({
      success: true,
      message: "Preview ready",
      rows: [
        { name: "Alice", username: "alice", status: PreviewStatus.Valid },
        {
          name: "Taker",
          username: "taken",
          status: PreviewStatus.AlreadyExists,
        },
      ],
      summary: { total: 2, valid: 1, skipped: 1 },
    });
    vi.mocked(bulkImportStudentsAction).mockResolvedValue({
      success: true,
      message: "Imported 1 student",
      report: [{ username: "alice", outcome: ImportOutcome.Created }],
      summary: { created: 1, skipped: 1, failed: 0 },
    });

    render(<BulkImportDialog courses={courses} />);

    // Open the dialog
    await user.click(screen.getByRole("button", { name: /import from file/i }));

    // Upload a file → parse + preview run
    await user.upload(screen.getByLabelText(/roster file/i), makeFile());

    // Preview rows appear with their statuses
    expect(await screen.findByText("@alice")).toBeInTheDocument();
    expect(screen.getByText(PreviewStatus.Valid)).toBeInTheDocument();
    expect(screen.getByText(PreviewStatus.AlreadyExists)).toBeInTheDocument();

    // Pick the course to enroll into
    await user.click(screen.getByLabelText(/math 101/i));

    // Confirm import (button enabled because there is 1 valid row)
    const importButton = screen.getByRole("button", { name: /^import 1 /i });
    expect(importButton).toBeEnabled();
    await user.click(importButton);

    // The import action was called with parsed rows + selected course
    expect(bulkImportStudentsAction).toHaveBeenCalledWith(parsedRows, ["c1"]);

    // The per-student report is shown
    expect(await screen.findByText(/imported 1 student/i)).toBeInTheDocument();
  });

  it("shows a format error and does not preview when the file is unusable", async () => {
    const user = userEvent.setup();
    vi.mocked(parseImportFile).mockResolvedValue({
      ok: false,
      error: ParseImportErrorKind.MissingHeader,
    });

    render(<BulkImportDialog courses={courses} />);
    await user.click(screen.getByRole("button", { name: /import from file/i }));
    await user.upload(screen.getByLabelText(/roster file/i), makeFile());

    // A format error is shown and the preview action is never called
    expect(await screen.findByRole("alert")).toHaveTextContent(/column/i);
    expect(previewImportAction).not.toHaveBeenCalled();
  });

  it("disables the import button when no row is valid", async () => {
    const user = userEvent.setup();
    vi.mocked(parseImportFile).mockResolvedValue({
      ok: true,
      rows: parsedRows,
    });
    vi.mocked(previewImportAction).mockResolvedValue({
      success: true,
      message: "Preview ready",
      rows: [
        {
          name: "Taker",
          username: "taken",
          status: PreviewStatus.AlreadyExists,
        },
      ],
      summary: { total: 1, valid: 0, skipped: 1 },
    });

    render(<BulkImportDialog courses={courses} />);
    await user.click(screen.getByRole("button", { name: /import from file/i }));
    await user.upload(screen.getByLabelText(/roster file/i), makeFile());

    await screen.findByText("@taken");
    expect(screen.getByRole("button", { name: /^import 0 /i })).toBeDisabled();
  });
});
