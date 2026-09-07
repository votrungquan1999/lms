import Link from "next/link";
import {
  type CourseJoinRequest,
  JoinRequestStatus,
} from "src/lib/course-join-request-service";
import {
  getCourseJoinRequestService,
  getCourseService,
  getStudentService,
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
 * Joins raw join requests with the student and course each one names.
 * D55: a request whose student or course no longer resolves is dropped, not
 * rendered as a placeholder — every returned row stays actionable. R9: the
 * `studentId` on the request is already the domain student id enrollment
 * uses, so the name shown here is provably the person approval would enroll.
 */
async function toVisibleRows(
  requests: CourseJoinRequest[],
): Promise<JoinRequestRowModel[]> {
  const studentIds = [...new Set(requests.map((r) => r.studentId))];
  const courseIds = [...new Set(requests.map((r) => r.courseId))];

  const studentService = await getStudentService();
  const courseService = await getCourseService();
  const [students, courses] = await Promise.all([
    studentService.findByIds(studentIds),
    courseService.getCoursesByIds(courseIds),
  ]);
  const studentById = new Map(students.map((s) => [s.id, s]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const rows: JoinRequestRowModel[] = [];
  for (const request of requests) {
    const student = studentById.get(request.studentId);
    const course = courseById.get(request.courseId);
    if (!student || !course) continue;
    rows.push({
      id: request.id,
      studentName: student.name,
      studentUsername: student.username,
      courseTitle: course.title,
      requestedAt: request.requestedAt,
    });
  }
  return rows;
}

/**
 * Admin join-request queue — lists requests for the active tab (Waiting by
 * default), showing who is asking and which course they want (Step 27),
 * and lets the admin switch between Waiting/Approved/Rejected (Step 28).
 */
export default async function JoinRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = resolveFilter(params.filter);
  const requestedPage = resolvePage(params.page);

  const joinRequestService = await getCourseJoinRequestService();
  const status = STATUS_BY_FILTER[filter];

  // D69: the total must count only rows the admin can actually SEE, and
  // whether a row is visible isn't known until after the student/course
  // join below — so this loads every matching request for the status,
  // unbounded (limit: 0 is Mongo's own "no limit"), on every page view.
  // Exact-but-unbounded by design; don't "optimize" this into a DB-level
  // skip/limit without re-deriving the total from the same filtered set.
  const { items: allRequests } = await joinRequestService.listByStatus(status, {
    skip: 0,
    limit: 0,
  });
  const visibleRows = await toVisibleRows(allRequests);

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
