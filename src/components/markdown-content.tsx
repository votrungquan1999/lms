"use client";

import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  /** Uses smaller text and tighter spacing for preview contexts. */
  compact?: boolean;
  className?: string;
}

/**
 * Wraps a rendered table in its own horizontal scroll container — the same
 * safety net `.prose pre` gets — so a table too wide to fit even with its
 * cells wrapping (many columns) scrolls sideways inside its own box instead
 * of widening, or being clipped by, the card/page.
 * @param props - The table's props from react-markdown; its syntax-tree
 *   `node` is dropped so it never lands on the DOM as a stray attribute.
 */
function MarkdownTable({
  node: _node,
  ...props
}: React.ComponentProps<"table"> & ExtraProps) {
  return (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  );
}

/**
 * Renders markdown content with proper Vietnamese diacritics and formatting.
 * Uses react-markdown with GFM (GitHub Flavored Markdown) and remark-breaks
 * (to naturally respect single-newline breaks).
 */
export function MarkdownContent({
  content,
  compact = false,
  className = "",
}: MarkdownContentProps) {
  const sizeClass = compact ? "prose-sm" : "prose-base";

  return (
    <div className={`prose prose-neutral ${sizeClass} max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{ table: MarkdownTable }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
