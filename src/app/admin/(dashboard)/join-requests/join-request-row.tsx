import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { ApproveRejectButtons } from "./approve-reject-buttons";
import type { JoinRequestRow as JoinRequestRowModel } from "./join-request-page.type";

/**
 * One row of the join-request queue — who is asking, which course, and the
 * actions that turn the request into an enrollment (Step 30).
 */
export function JoinRequestRow({ row }: { row: JoinRequestRowModel }) {
  return (
    <Card data-testid={`join-request-row-${row.id}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="min-w-0 wrap-anywhere">
          <CardTitle className="text-base">{row.studentName}</CardTitle>
          <CardDescription>
            @{row.studentUsername} wants to join {row.courseTitle}
          </CardDescription>
        </div>
        <ApproveRejectButtons requestId={row.id} />
      </CardHeader>
    </Card>
  );
}
