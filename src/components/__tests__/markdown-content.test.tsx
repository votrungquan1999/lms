// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "../markdown-content";

describe("Feature: markdown tables render as clean HTML tables", () => {
  it("renders a table with its cells and no stray renderer attribute on the table element", () => {
    render(
      <MarkdownContent content={"| A | B |\n| --- | --- |\n| one | two |"} />,
    );

    const table = screen.getByRole("table");
    expect(screen.getByRole("cell", { name: "one" })).toBeInTheDocument();
    // react-markdown hands custom components its syntax-tree node; spread
    // onto the DOM it becomes a junk `node="[object Object]"` attribute.
    expect(table).not.toHaveAttribute("node");
  });
});
