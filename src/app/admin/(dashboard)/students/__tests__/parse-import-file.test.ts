import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ParseImportErrorKind, parseImportFile } from "../parse-import-file";

/** Builds an in-memory `.xlsx` File from a 2D array of cells. */
function makeXlsxFile(rows: string[][]): File {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([buffer], "roster.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("Feature: Bulk student import — file parsing", () => {
  it("parses a valid CSV into trimmed rows and skips fully-empty rows", async () => {
    // Given a CSV with a header, two data rows (one padded with spaces), and a blank row
    const csv =
      "name,username,password\n Alice Nguyen , alice , secret123 \n,,\nBob Tran,bob,password1\n";
    const file = new File([csv], "roster.csv", { type: "text/csv" });

    // When
    const result = await parseImportFile(file);

    // Then
    expect(result).toEqual({
      ok: true,
      rows: [
        { name: "Alice Nguyen", username: "alice", password: "secret123" },
        { name: "Bob Tran", username: "bob", password: "password1" },
      ],
    });
  });

  it("returns a missing-header error when a required column is absent", async () => {
    // Given a CSV missing the `password` column
    const csv = "name,username\nAlice Nguyen,alice\n";
    const file = new File([csv], "roster.csv", { type: "text/csv" });

    // When
    const result = await parseImportFile(file);

    // Then
    expect(result).toEqual({
      ok: false,
      error: ParseImportErrorKind.MissingHeader,
    });
  });

  it("returns a no-rows error when the file has a header but no data rows", async () => {
    // Given a CSV with only a header and a blank line
    const csv = "name,username,password\n,,\n";
    const file = new File([csv], "roster.csv", { type: "text/csv" });

    // When
    const result = await parseImportFile(file);

    // Then
    expect(result).toEqual({
      ok: false,
      error: ParseImportErrorKind.NoRows,
    });
  });

  it("accepts a file with exactly 200 data rows", async () => {
    // Given a CSV with exactly 200 data rows (the cap)
    const dataRows = Array.from(
      { length: 200 },
      (_, i) => `Student ${i},user${i},password${i}`,
    ).join("\n");
    const csv = `name,username,password\n${dataRows}\n`;
    const file = new File([csv], "roster.csv", { type: "text/csv" });

    // When
    const result = await parseImportFile(file);

    // Then the result is successful with all 200 rows
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a successful parse");
    expect(result.rows).toHaveLength(200);
  });

  it("returns a too-many-rows error when the file exceeds 200 data rows", async () => {
    // Given a CSV with 201 data rows
    const dataRows = Array.from(
      { length: 201 },
      (_, i) => `Student ${i},user${i},password${i}`,
    ).join("\n");
    const csv = `name,username,password\n${dataRows}\n`;
    const file = new File([csv], "roster.csv", { type: "text/csv" });

    // When
    const result = await parseImportFile(file);

    // Then
    expect(result).toEqual({
      ok: false,
      error: ParseImportErrorKind.TooManyRows,
    });
  });

  it("parses a valid XLSX file into the same row shape as CSV", async () => {
    // Given an .xlsx file with a header and one data row
    const file = makeXlsxFile([
      ["name", "username", "password"],
      ["Alice Nguyen", "alice", "secret123"],
    ]);

    // When
    const result = await parseImportFile(file);

    // Then
    expect(result).toEqual({
      ok: true,
      rows: [
        { name: "Alice Nguyen", username: "alice", password: "secret123" },
      ],
    });
  });

  it("keeps numeric-looking passwords and usernames as strings", async () => {
    // Given a CSV whose username and password are purely numeric
    const csv = "name,username,password\nAlice Nguyen,12345,87654321\n";
    const file = new File([csv], "roster.csv", { type: "text/csv" });

    // When
    const result = await parseImportFile(file);

    // Then numeric cells are returned as strings, not numbers
    expect(result).toEqual({
      ok: true,
      rows: [{ name: "Alice Nguyen", username: "12345", password: "87654321" }],
    });
  });
});
