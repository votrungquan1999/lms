import { ArrowRight } from "lucide-react";
import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Progress } from "src/components/ui/progress";

/**
 * Dashboard course tile showing the course title/description, a graded-progress
 * bar, and a "needs action" badge when tests await the student.
 * @param title - Course title.
 * @param description - Optional course description.
 * @param total - Total number of tests in the course.
 * @param graded - Number of graded tests.
 * @param toDo - Number of tests needing the student's action.
 */
export function CourseCard({
  title,
  description,
  total,
  graded,
  toDo,
}: {
  title: string;
  description?: string | null;
  total: number;
  graded: number;
  toDo: number;
}) {
  const percent = total > 0 ? Math.round((graded / total) * 100) : 0;

  return (
    <Card className="h-full transition-all hover:border-primary/40 hover:shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
        </div>
        {description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {total} test{total !== 1 ? "s" : ""}
          </Badge>
          {toDo > 0 && <Badge variant="warning">{toDo} to do</Badge>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {graded} / {total} graded
            </span>
            <span className="font-medium">{percent}%</span>
          </div>
          <Progress value={percent} />
        </div>
      </CardContent>
    </Card>
  );
}
