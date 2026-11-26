import Link from "next/link";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
import {
  getCourseJoinRequestService,
  getPageGuard,
} from "src/lib/services-singleton";
import { joinRequestsHref } from "./href";
import {
  JoinRequestFilter,
  type JoinRequestRow as JoinRequestRowModel,
} from "./join-request-page.type";
import { JoinRequestRow } from "./join-request-row";
import { PaginationControls } from "./pagination-controls";

export const metadata = {
  title: "Join Requests — LMS Admin",
  description: "Requests waiting for admin approval to join a course",
};

const PAGE_SIZE = 10;

const FILTER_OPTIONS: { value: JoinRequestFilter; label: string }[] = [
  { value: JoinRequestFilter.Waiting, label: "Waiting" },
  { value: JoinRequestFilter.Approved, label: "Approved" },
  { value: JoinRequestFilter.Rejected, label: "Rejected" },
];

const STATUS_BY_FILTER: Record<JoinRequestFilter, JoinRequestStatus> = {
  [JoinRequestFilter.Waiting]: JoinRequestStatus.Pending,
  [JoinRequestFilter.Approved]: JoinRequestStatus.Approved,
  [JoinRequestFilter.Rejected]: JoinRequestStatus.Rejected,
};

function resolveFilter(raw: string | string[] | undefined): JoinRequestFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Derived from the enum itself so a new JoinRequestFilter member can't
  // silently fall back to Waiting by being missing from a hand-written list.
  const match = Object.values(JoinRequestFilter).find((f) => f === value);
  return match ?? JoinRequestFilter.Waiting;
}

// Above this, a page number carries no more real pages to clamp to than
// Number.MAX_SAFE_INTEGER would, but stays a safe integer for the
// arithmetic below (skip/limit math, array slicing) either way.
const MAX_PAGE = Number.MAX_SAFE_INTEGER;

function resolvePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = value ? Number.parseInt(value, 10) : 1;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}

/**
 * Admin join-request queue — lists requests for the active tab (Waiting by
 * default), showing who is asking and which course they want,
 * and lets the admin switch between Waiting/Approved/Rejected.
 */
export default async function JoinRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const params = await searchParams;
  const filter = resolveFilter(params.filter);
  const requestedPage = resolvePage(params.page);

  const joinRequestService = await getCourseJoinRequestService(
    session.school.id,
  );
  const status = STATUS_BY_FILTER[filter];

  // The total must count only rows the admin can actually SEE, and
  // whether a row is visible isn't known until the service has looked up
  // each student and course — so this loads every visible request for the
  // status on every page view. Exact-but-unbounded by design; don't
  // "optimize" this into a DB-level skip/limit without re-deriving the
  // total from the same filtered set.
  const visibleRows: JoinRequestRowModel[] =
    await joinRequestService.listVisibleByStatus(status);

  const total = visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A stale bookmarked page whose rows have since moved on overshoots the
  // real range — clamp to the last page rather than showing an empty screen.
  const page =
    requestedPage > totalPages && total > 0 ? totalPages : requestedPage;
  const rows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Default filter empty = good state ("caught up"); any other filter empty
  // is just neutral ("no requests match") — same distinction as grading/page.tsx.
  const isCaughtUp = filter === JoinRequestFilter.Waiting && rows.length === 0;
  const isEmpty = rows.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Join Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Requests to join a course.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filter join requests">
        {FILTER_OPTIONS.map((opt) => {
          const isActive = filter === opt.value;
          return (
            <Link
              key={opt.value}
              href={joinRequestsHref({ filter: opt.value })}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </nav>

      <section className="space-y-3">
        {isCaughtUp && (
          <p className="text-center text-muted-foreground">All caught up.</p>
        )}
        {!isCaughtUp && isEmpty && (
          <p className="text-center text-muted-foreground">
            No requests match.
          </p>
        )}
        {rows.map((row) => (
          <JoinRequestRow key={row.id} row={row} />
        ))}
      </section>

      <PaginationControls
        filter={filter}
        page={page}
        totalPages={totalPages}
        total={total}
      />
    </div>
  );
}
