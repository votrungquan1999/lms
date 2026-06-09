/**
 * Client-side parser for bulk-student-import roster files (`.csv` / `.xlsx`).
 *
 * Parses a selected file into trimmed `{ name, username, password }` rows, skipping
 * fully-empty rows. Returns a typed discriminated-union result so the UI can surface a
 * specific format error rather than throwing. `xlsx` (SheetJS) is lazy-imported so it stays
 * out of the server bundle and the initial client bundle.
 */

/** A parsed roster row (all fields trimmed strings). */
export interface ImportRow {
  name: string;
  username: string;
  password: string;
}

/** The successful or failed outcome of parsing a roster file. */
export type ParseImportResult =
  | { ok: true; rows: ImportRow[] }
  | { ok: false; error: ParseImportErrorKind };

/** Why a roster file could not be turned into rows. */
export enum ParseImportErrorKind {
  Unreadable = "unreadable",
  MissingHeader = "missing-header",
  NoRows = "no-rows",
  TooManyRows = "too-many-rows",
}

const REQUIRED_HEADERS = ["name", "username", "password"] as const;

/** Maximum number of data rows accepted per upload (bounds latency on the M0 tier). */
const MAX_ROWS = 200;

/**
 * Parses a roster `File` into trimmed student rows or a typed format error.
 * @param file - The selected `.csv` or `.xlsx` file.
 * @returns A discriminated-union result: rows on success, or an error kind.
 */
export async function parseImportFile(file: File): Promise<ParseImportResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    return { ok: false, error: ParseImportErrorKind.Unreadable };
  }

  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  const headerRow = matrix[0] ?? [];
  const columnIndex = resolveColumnIndices(headerRow);
  if (
    columnIndex.name === -1 ||
    columnIndex.username === -1 ||
    columnIndex.password === -1
  ) {
    return { ok: false, error: ParseImportErrorKind.MissingHeader };
  }

  const rows: ImportRow[] = [];
  for (const cells of matrix.slice(1)) {
    const row: ImportRow = {
      name: (cells[columnIndex.name] ?? "").trim(),
      username: (cells[columnIndex.username] ?? "").trim(),
      password: (cells[columnIndex.password] ?? "").trim(),
    };
    if (row.name === "" && row.username === "" && row.password === "") {
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    return { ok: false, error: ParseImportErrorKind.NoRows };
  }

  if (rows.length > MAX_ROWS) {
    return { ok: false, error: ParseImportErrorKind.TooManyRows };
  }

  return { ok: true, rows };
}

/**
 * Maps each required header to its column index, matching case-insensitively and trimmed.
 * @param headerRow - The first row of the sheet.
 * @returns A record of required-header name to its column index.
 */
function resolveColumnIndices(
  headerRow: string[],
): Record<(typeof REQUIRED_HEADERS)[number], number> {
  const normalized = headerRow.map((cell) => (cell ?? "").trim().toLowerCase());
  return {
    name: normalized.indexOf("name"),
    username: normalized.indexOf("username"),
    password: normalized.indexOf("password"),
  };
}
