"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

interface MarkdownContentProps {
  content: string;
  /** Uses smaller text and tighter spacing for preview contexts. */
  compact?: boolean;
  className?: string;
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
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
