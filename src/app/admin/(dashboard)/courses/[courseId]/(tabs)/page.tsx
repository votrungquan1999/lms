import { notFound } from "next/navigation";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import {
  getCourseService,
  getPageGuard,
  getTestService,
} from "src/lib/services-singleton";
import { buildTestRows, RowAction } from "./test-rows";
import { TestRowView, TestsColumnHeader } from "./tests-table.ui";

export const metadata = {
  title: "Course Detail — LMS Admin",
  description: "Manage course enrollments and tests",
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId } = await params;

  const courseService = await getCourseService(session.school.id);
  const course = await courseService.getCourse(courseId);
  if (!course) notFound();

  const testService = await getTestService(session.school.id);
  const tests = await testService.listTests(courseId);

  // The layout's header and the sidebar badge share this request's cached run.
  const counts = await getSchoolGradingCounts(session.school.id);
  const rows = buildTestRows(tests, counts, new Date());
  const needsAction = rows.filter((row) => row.action !== RowAction.Open);

  return (
    <>
      {needsAction.length > 0 && (
        <section aria-label="Needs your action" className="grid gap-2.5">
          <h2 className="text-[17px] font-semibold">
            Needs your action{" "}
            <span className="font-medium text-muted-foreground">
              ({needsAction.length})
            </span>
          </h2>
          <div className="rounded-xl border bg-card">
            <TestsColumnHeader />
            {needsAction.map((row) => (
              <TestRowView
                key={row.testId}
                row={row}
                line={row.actionLine}
                showTags={false}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label="All tests" className="grid gap-2.5">
        <h2 className="text-[17px] font-semibold">
          All tests{" "}
          <span className="font-medium text-muted-foreground">
            ({rows.length})
          </span>
        </h2>
        {rows.length > 0 ? (
          <div className="rounded-xl border bg-card">
            <TestsColumnHeader />
            {rows.map((row) => (
              <TestRowView
                key={row.testId}
                row={row}
                line={row.meta}
                showTags
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tests yet.</p>
        )}
      </section>
    </>
  );
}
