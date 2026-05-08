"use client";

/**
 * Wraps the `?` icon used as a tooltip trigger inside the dashboard's
 * full-card `<Link>`. Stops the click from triggering navigation so the
 * tooltip can open without leaving the page. Uses `<span role="button">`
 * (not `<button>`) because nesting `<button>` inside `<a>` is invalid HTML.
 */
export function GradingTooltipTrigger({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: <button> cannot nest inside <a> per HTML spec; using <span role="button"> to avoid invalid markup.
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className="inline-flex items-center"
    >
      {children}
    </span>
  );
}
