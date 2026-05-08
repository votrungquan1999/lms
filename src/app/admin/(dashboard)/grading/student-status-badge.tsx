import { CheckCircle2, Clock, Inbox, MinusCircle } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { TestStatus } from "src/lib/test-status-service";

interface StudentStatusBadgeProps {
  status: TestStatus;
}

interface StatusPresentation {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}

const STATUS_PRESENTATION: Record<TestStatus, StatusPresentation> = {
  [TestStatus.Submitted]: {
    label: "Submitted",
    icon: Inbox,
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  },
  [TestStatus.InProgress]: {
    label: "In progress",
    icon: Clock,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  },
  [TestStatus.NotStarted]: {
    label: "Not started",
    icon: MinusCircle,
    className: "bg-muted text-muted-foreground",
  },
  [TestStatus.Graded]: {
    label: "Graded",
    icon: CheckCircle2,
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  },
};

/**
 * Displays a per-student test status as a labelled, coloured badge with an icon.
 * Used by both the course-scoped grading page and the variant grading page.
 */
export function StudentStatusBadge({ status }: StudentStatusBadgeProps) {
  const { label, icon: Icon, className } = STATUS_PRESENTATION[status];

  return (
    <Badge data-status={status} className={className}>
      <Icon />
      {label}
    </Badge>
  );
}
