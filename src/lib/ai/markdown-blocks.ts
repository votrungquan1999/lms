// A bullet or numbered list item, e.g. "- step" / "2. step".
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s/;
// A Markdown table row, e.g. "| (1) | I |".
const TABLE_ROW = /^\s*\|/;

type Block = "list" | "table" | null;

/**
 * Ensures block-level Markdown (lists, tables) is closed by a blank line.
 * The AI often writes a block's closing sentence on the very next line,
 * which Markdown folds into the last bullet or renders as an extra table
 * row; the LMS renders content as Markdown.
 * @param content - Markdown question content from the AI.
 * @returns The content with any missing block-closing blank lines added.
 */
export function separateMarkdownBlocks(content: string): string {
  const result: string[] = [];
  let block: Block = null;
  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      block = null;
    } else if (LIST_ITEM.test(line)) {
      block = "list";
    } else if (TABLE_ROW.test(line)) {
      block = "table";
    } else if (block === "list" && /^\s/.test(line)) {
      // Indented lines continue the current list item.
    } else {
      // An ordinary line right after a list or table starts a new paragraph.
      if (block !== null) result.push("");
      block = null;
    }
    result.push(line);
  }
  return result.join("\n");
}
