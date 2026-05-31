import { Badge } from "src/components/ui/badge";
import { TestStatus } from "src/lib/test-status-service";

type StatusVariant = "outline" | "warning" | "info" | "success";

interface StatusConfig {
  label: string;
  variant: StatusVariant;
}

const statusConfig: Record<TestStatus, StatusConfig> = {
  [TestStatus.NotStarted]: { label: "Not Started", variant: "outline" },
  [TestStatus.InProgress]: { label: "In Progress", variant: "warning" },
  [TestStatus.Submitted]: { label: "Submitted", variant: "info" },
  [TestStatus.Graded]: { label: "Graded", variant: "success" },
};

/**
 * Renders a colored badge for a test's status using semantic Badge variants.
 * @param status - The test status to display.
 */
export function StatusBadge({ status }: { status: TestStatus }) {
  const { label, variant } = statusConfig[status];
  return <Badge variant={variant}>{label}</Badge>;
}
