// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreeTextAnswerBlock } from "../answer-pane.ui";

describe("FreeTextAnswerBlock line count", () => {
  it("counts a trailing newline as the end of the last line, not an extra line", () => {
    render(<FreeTextAnswerBlock text={"first\nsecond\n"} />);

    expect(screen.getByTestId("answer-line-count")).toHaveTextContent(
      "2 lines",
    );
  });

  it("reads a single line as '1 line'", () => {
    render(<FreeTextAnswerBlock text={"only\n"} />);

    expect(screen.getByTestId("answer-line-count")).toHaveTextContent("1 line");
  });
});
