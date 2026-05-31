import type { LucideIcon } from "lucide-react";

/**
 * Centered empty-state panel with an icon, title, and message. Used when a list
 * (courses, tests) has no items to show.
 * @param icon - Lucide icon component shown above the text.
 * @param title - Short headline describing the empty state.
 * @param message - Supporting explanation for the empty state.
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
