import {
  getEnrollmentService,
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
  title: "Results Report — LMS Admin",
  description: "Export a student's results across selected tests as a PDF",
};

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
  const { courseId } = await params;

  const enrollmentService = await getEnrollmentService();
  const enrolledStudentIds =
    await enrollmentService.listEnrollmentsByCourse(courseId);

  const studentService = await getStudentService();
  const students = await studentService.findByIds(enrolledStudentIds);

  const testService = await getTestService();
  const tests = await testService.listTests(courseId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Export Results</h1>
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
        <section className="w-full max-w-2xl space-y-6">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Student</h2>
            <StudentChoiceList />
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Tests</h2>
            <TestChoiceList />
          </div>
          <ExportButton />
        </section>
      </ResultsReportSelectionProvider>
    </div>
  );
}
