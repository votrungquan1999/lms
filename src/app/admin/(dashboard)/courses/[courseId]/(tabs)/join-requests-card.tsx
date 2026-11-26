import type { VisibleCourseJoinRequest } from "src/lib/course-join-request-service";
import { relativeTimeAgo } from "src/lib/relative-time";
import { ApproveRejectButtons } from "../../../join-requests/approve-reject-buttons";

/**
 * The course's waiting join requests, oldest first, handled in place. Renders
 * nothing when none wait.
 * @param requests - The course's pending requests the teacher can act on.
 * @param now - The current time, read once on the server so every row counts from the same moment.
 */
export function JoinRequestsCard({
  requests,
  now,
}: {
  requests: VisibleCourseJoinRequest[];
  now: Date;
}) {
  if (requests.length === 0) return null;
  return (
    <section aria-label="Join requests" className="space-y-3">
      <h2 className="text-[17px] font-semibold">
        Join requests{" "}
        <span className="font-medium text-muted-foreground">
          ({requests.length})
        </span>
      </h2>
      <ul className="space-y-2">
        {requests.map((request) => (
          <li
            key={request.id}
            data-testid={`join-request-row-${request.id}`}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-l-4 border-l-amber-500 bg-card px-4 py-3.5"
          >
            <div className="min-w-0 flex-1 wrap-anywhere">
              <p className="text-[15px] font-semibold">
                {request.studentName}{" "}
                <span className="font-normal text-muted-foreground">
                  @{request.studentUsername}
                </span>
              </p>
              <p className="text-[13px] text-muted-foreground">
                Asked to join through the join link ·{" "}
                {relativeTimeAgo(request.requestedAt, now)}
              </p>
            </div>
            <ApproveRejectButtons requestId={request.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
