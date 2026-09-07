import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import type { JoinRequestRow as JoinRequestRowModel } from "./join-request-page.type";

/**
 * One row of the join-request queue — who is asking and which course.
 */
export function JoinRequestRow({ row }: { row: JoinRequestRowModel }) {
  return (
    <Card data-testid={`join-request-row-${row.id}`}>
      <CardHeader>
        <CardTitle className="text-base">{row.studentName}</CardTitle>
        <CardDescription>
          @{row.studentUsername} wants to join {row.courseTitle}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
