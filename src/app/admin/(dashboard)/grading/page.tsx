import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  getCourseService,
  getEnrollmentService,
  getQuestionService,
  getTestService,
  getTestStatusService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";

export const metadata = {
  title: "Grading — LMS Admin",
  description: "Tests needing grading across all courses",
};

interface HubRow {
  testId: string;
  testTitle: string;
  courseId: string;
  courseTitle: string;
  ungradedCount: number;
  enrolledCount: number;
  counts: Record<TestStatus, number>;
}

type FilterValue =
  | "needs-grading"
  | "partially-graded"
  | "fully-graded"
  | "all";

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "needs-grading", label: "Needs grading" },
  { value: "partially-graded", label: "Partially graded" },
  { value: "fully-graded", label: "Fully graded" },
  { value: "all", label: "All" },
];

function resolveFilter(raw: string | string[] | undefined): FilterValue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "needs-grading" ||
    value === "partially-graded" ||
    value === "fully-graded" ||
    value === "all"
  ) {
    return value;
  }
  return "needs-grading";
}

function matchesFilter(row: HubRow, filter: FilterValue): boolean {
  const enrolled = row.enrolledCount;
  const graded = row.counts[TestStatus.Graded];
  const submitted = row.counts[TestStatus.Submitted];
  const inProgress = row.counts[TestStatus.InProgress];
  const notStarted = row.counts[TestStatus.NotStarted];

  if (filter === "all") return true;
  if (enrolled === 0) return false;
  if (filter === "needs-grading") return submitted > 0;
  if (filter === "fully-graded") return graded === enrolled;
  if (filter === "partially-graded") {
    return graded > 0 && submitted + inProgress + notStarted > 0;
  }
  return false;
}

/**
 * Grading hub — lists tests across all courses with filter pills.
 * Default view: tests with ≥1 student in `Submitted` (not yet graded).
 * Sort: ungraded count desc; tiebreaker = course title asc.
 */
export default async function GradingHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = resolveFilter(params.filter);

  const testService = await getTestService();
  const courseService = await getCourseService();
  const enrollmentService = await getEnrollmentService();
  const questionService = await getQuestionService();
  const testStatusService = await getTestStatusService();

  const allTests = await testService.listAllTests();
  const courseIds = [...new Set(allTests.map((t) => t.courseId))];
  const courses = await courseService.getCoursesByIds(courseIds);
  const courseTitleById = new Map(courses.map((c) => [c.id, c.title]));

  const enrollmentsByCourse = new Map<string, string[]>();

  const rows: HubRow[] = [];
  for (const t of allTests) {
    let studentIds = enrollmentsByCourse.get(t.courseId);
    if (!studentIds) {
      studentIds = await enrollmentService.listEnrollmentsByCourse(t.courseId);
      enrollmentsByCourse.set(t.courseId, studentIds);
    }
    const questions = await questionService.listQuestions(t.id);
    const counts = await testStatusService.getStatusCounts(
      t.id,
      studentIds,
      questions.length,
    );
    rows.push({
      testId: t.id,
      testTitle: t.title,
      courseId: t.courseId,
      courseTitle: courseTitleById.get(t.courseId) ?? "(unknown)",
      ungradedCount: counts[TestStatus.Submitted],
      enrolledCount: studentIds.length,
      counts,
    });
  }

  const filteredRows = rows.filter((r) => matchesFilter(r, filter));

  filteredRows.sort((a, b) => {
    const diff = b.ungradedCount - a.ungradedCount;
    if (diff !== 0) return diff;
    return a.courseTitle.localeCompare(b.courseTitle);
  });

  const isCaughtUp = filter === "needs-grading" && filteredRows.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Grading</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tests with students waiting for a grade.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filter tests">
        {FILTER_OPTIONS.map((opt) => {
          const isActive = filter === opt.value;
          const href =
            opt.value === "needs-grading"
              ? "/admin/grading"
              : `/admin/grading?filter=${opt.value}`;
          return (
            <Link
              key={opt.value}
              href={href}
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

        {!isCaughtUp && filteredRows.length === 0 && (
          <p className="text-center text-muted-foreground">No tests match.</p>
        )}

        {filteredRows.map((row) => (
          <Link key={row.testId} href={`/admin/grading/${row.testId}`}>
            <Card
              className="transition-colors hover:bg-accent/50"
              data-testid={`hub-test-card-${row.testId}`}
              data-test-id={row.testId}
            >
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{row.testTitle}</CardTitle>
                  <CardDescription>{row.courseTitle}</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{row.ungradedCount}</div>
                  <CardDescription>ungraded</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
