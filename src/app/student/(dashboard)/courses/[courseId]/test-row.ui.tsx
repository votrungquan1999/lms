import { ChevronRight } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import { Card, CardHeader, CardTitle } from "src/components/ui/card";
import type { TestStatus } from "src/lib/test-status-service";
import { StatusBadge } from "../../_ui/status-badge.ui";

/**
 * A single test row in the course detail list: title, question count, optional
 * description, status badge, and (when graded) the average score.
 * @param title - Test title.
 * @param questionCount - Number of questions in the test.
 * @param description - Optional test description.
 * @param status - The student's status for this test.
 * @param averageScore - Average score when graded, otherwise null.
 */
export function TestRow({
  title,
  questionCount,
  description,
  status,
  averageScore,
}: {
  title: string;
  questionCount: number;
  description?: string | null;
  status: TestStatus;
  averageScore: number | null;
}) {
  return (
    <Card
      size="sm"
      className="transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {questionCount} question{questionCount !== 1 ? "s" : ""}
              {description && ` · ${description}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={status} />
            {averageScore !== null && (
              <Badge variant="outline">{averageScore.toFixed(0)}/100</Badge>
            )}
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
