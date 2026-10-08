import { describe, expect, it } from "vitest";
import { separateMarkdownBlocks } from "../markdown-blocks";

describe("separateMarkdownBlocks", () => {
  it("puts a blank line between a bullet list and the unindented line after it, so that line renders as its own paragraph", () => {
    // Without it, Markdown folds the line into the last bullet (seen in a real Gemini import).
    expect(
      separateMarkdownBlocks(
        "Các bước:\n- Lấy mẫu\n- Cấy mẫu\nQuy trình trên thuộc phương pháp",
      ),
    ).toBe(
      "Các bước:\n- Lấy mẫu\n- Cấy mẫu\n\nQuy trình trên thuộc phương pháp",
    );
  });

  it("puts a blank line between a table and the line after it, so that line is not rendered as an extra table row", () => {
    expect(
      separateMarkdownBlocks(
        "| Pha | Đặc điểm |\n|---|---|\n| (1) | I |\nTổ hợp ghép đúng là",
      ),
    ).toBe("| Pha | Đặc điểm |\n|---|---|\n| (1) | I |\n\nTổ hợp ghép đúng là");
  });

  it("leaves an indented line inside its bullet, since indentation marks it as that item's continuation", () => {
    const content =
      "- Cấy mẫu lên đĩa petri\n  xuất hiện các khuẩn lạc riêng rẽ\n- Chọn một khuẩn lạc";

    expect(separateMarkdownBlocks(content)).toBe(content);
  });

  it("still separates the closing line when the last bullet ends in an indented continuation", () => {
    expect(
      separateMarkdownBlocks(
        "- Cấy mẫu lên đĩa petri\n  xuất hiện khuẩn lạc\nQuy trình trên thuộc phương pháp",
      ),
    ).toBe(
      "- Cấy mẫu lên đĩa petri\n  xuất hiện khuẩn lạc\n\nQuy trình trên thuộc phương pháp",
    );
  });
});
