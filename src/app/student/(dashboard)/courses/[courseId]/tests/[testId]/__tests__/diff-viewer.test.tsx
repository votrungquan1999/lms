// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { diffProps } = vi.hoisted(() => ({ diffProps: vi.fn() }));

vi.mock("react-diff-viewer-continued", () => ({
  default: (props: { oldValue: string; newValue: string }) => {
    diffProps(props);
    return null;
  },
}));

vi.mock("src/components/theme-provider", () => ({
  useTheme: () => ({ isDark: false }),
}));

import { DiffViewer } from "../diff-viewer";

describe("DiffViewer", () => {
  it("normalizes line endings and trailing whitespace so identical code is handed to the diff as equal", () => {
    diffProps.mockClear();

    // Given: a CRLF student answer with trailing spaces and an LF solution
    // that are the same code apart from whitespace.
    render(
      <DiffViewer
        studentAnswer={"def f():  \r\n    return 1\r\n"}
        solution={"def f():\n    return 1\n"}
      />,
    );

    // Then: the diff library receives two normalized, equal strings, so no
    // line is flagged as changed.
    const props = diffProps.mock.calls[0]?.[0];
    expect(props?.oldValue).toBe("def f():\n    return 1\n");
    expect(props?.newValue).toBe("def f():\n    return 1\n");
    expect(props?.oldValue).toBe(props?.newValue);
  });
});
