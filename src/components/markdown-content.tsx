"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  /** Uses smaller text and tighter spacing for preview contexts. */
  compact?: boolean;
  className?: string;
}

/**
 * Renders markdown content with proper Vietnamese diacritics and formatting.
 * Uses react-markdown with GFM (GitHub Flavored Markdown) support.
 */
export function MarkdownContent({
  content,
  compact = false,
  className = "",
}: MarkdownContentProps) {
  const sizeClass = compact ? "prose-sm" : "prose-base";

  return (
    <div className={`prose prose-neutral ${sizeClass} max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
