import { Clock } from "lucide-react";
import { Card, CardContent } from "src/components/ui/card";

/**
 * Banner telling a student one or more of their join requests are still
 * waiting on admin approval. Shown independent of the course list's empty
 * state (R13) — a student enrolled elsewhere with a second request pending
 * must see this too, not just a student with zero courses.
 */
export function PendingRequestNotice() {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
          <Clock className="size-4" />
        </div>
        <p className="text-sm text-muted-foreground">
          Your request to join a course is pending admin approval.
        </p>
      </CardContent>
    </Card>
  );
}
