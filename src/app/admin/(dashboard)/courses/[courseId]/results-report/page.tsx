import { notFound } from "next/navigation";
import {
  getCourseService,
  getEnrollmentService,
  getPageGuard,
  getStudentService,
  getTestService,
} from "src/lib/services-singleton";
import { ResultsReportSelectionProvider } from "./results-report-selection.state";
import {
  ExportButton,
  StudentChoiceList,
  TestChoiceList,
} from "./results-report-selection.ui";

export const metadata = {
  title: "Export results — LMS Admin",
  description: "Export a student's results across selected tests as a PDF",
};

/**
 * A numbered card with a title and a right-aligned hint, holding one choice list.
 */
function StepCard({
  step,
  title,
  hint,
  headingId,
  children,
}: {
  step: number;
  title: string;
  hint: string;
  headingId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-xl border bg-card"
    >
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <span
          aria-hidden="true"
          className="flex size-6 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {step}
        </span>
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        <span className="ml-auto text-right text-sm text-muted-foreground">
          {hint}
        </span>
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

/**
 * Admin export view: pick one enrolled student and multiple course tests, then
 * download that student's combined results PDF. Server component — fetches the
 * enrolled students and course tests and composes the client selection island.
 */
export default async function ResultsReportPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { courseId } = await params;

  const courseService = await getCourseService(session.school.id);
  const course = await courseService.getCourse(courseId);
  if (!course) {
    notFound();
  }

  const enrollmentService = await getEnrollmentService(session.school.id);
  const enrolledStudentIds =
    await enrollmentService.listEnrollmentsByCourse(courseId);

  const studentService = await getStudentService(session.school.id);
  // findByIds returns documents in storage order; sort by name, then id so equal names never swap
  const students = (await studentService.findByIds(enrolledStudentIds)).sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );

  const testService = await getTestService(session.school.id);
  const tests = await testService.listTests(courseId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight">Export results</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick one student and the tests to include, then export a PDF to share
          with parents.
        </p>
      </header>

      <ResultsReportSelectionProvider
        courseId={courseId}
        students={students}
        tests={tests}
      >
        <div className="grid w-full max-w-5xl items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
          <StepCard
            step={1}
            title="Student"
            hint="Pick one"
            headingId="export-student-heading"
          >
            <StudentChoiceList labelledBy="export-student-heading" />
          </StepCard>
          <div className="flex min-w-0 flex-col gap-4">
            <StepCard
              step={2}
              title={`Tests (${tests.length})`}
              hint="Newest first · tick at least one"
              headingId="export-tests-heading"
            >
              <TestChoiceList labelledBy="export-tests-heading" />
            </StepCard>
            <ExportButton />
          </div>
        </div>
      </ResultsReportSelectionProvider>
    </div>
  );
}
