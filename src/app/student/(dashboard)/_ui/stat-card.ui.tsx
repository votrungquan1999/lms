import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "src/components/ui/card";

type StatTone = "default" | "warning" | "info" | "success";

const toneClass: Record<StatTone, string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
};

/**
 * Compact metric card showing a labelled value with an accent icon. Used in the
 * dashboard summary row.
 * @param label - Metric label (e.g. "Courses").
 * @param value - Metric value to display.
 * @param icon - Lucide icon shown in the accent chip.
 * @param tone - Color tone for the icon chip.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: StatTone;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass[tone]}`}
        >
          <Icon className="size-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-semibold leading-none">{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}
