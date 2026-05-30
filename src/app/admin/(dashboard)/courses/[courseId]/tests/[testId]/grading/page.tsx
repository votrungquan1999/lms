import { notFound } from "next/navigation";
import {
  GradingMode,
  GradingSort,
} from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { GradingPageShell } from "src/app/admin/(dashboard)/grading/page-body/grading-page-shell";
import {
  getEnrollmentService,
  getQuestionService,
  getTestService,
} from "src/lib/services-singleton";
import { ReleaseGradesButton } from "./grading-forms";

export const metadata = {
  title: "Grade Test — LMS Admin",
  description: "Grade student submissions",
};

export default async function GradingPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; testId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { courseId, testId } = await params;
  const sp = (await searchParams) ?? {};
  const rawStudentId = sp.studentId;
  const studentId = typeof rawStudentId === "string" ? rawStudentId : undefined;
  const rawQuestionId = sp.questionId;
  const questionId =
    typeof rawQuestionId === "string" ? rawQuestionId : undefined;
  const mode =
    sp.mode === GradingMode.Question
      ? GradingMode.Question
      : GradingMode.Student;
  const sort =
    sp.sort === GradingSort.Name
      ? GradingSort.Name
      : sp.sort === GradingSort.Status
        ? GradingSort.Status
        : GradingSort.Enrollment;

  const testService = await getTestService();
  const test = await testService.getTest(testId);
  if (!test || test.courseId !== courseId) {
    notFound();
  }

  const enrollmentService = await getEnrollmentService();
  const studentIds = await enrollmentService.listEnrollmentsByCourse(courseId);

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full">
        <h1 className="text-3xl font-bold tracking-tight">
          Grade: {test.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {studentIds.length} student(s) enrolled · {questions.length}{" "}
          question(s)
        </p>
        {!test.showGradeAfterSubmit && !test.gradesReleasedAt && (
          <div className="mt-4">
            <ReleaseGradesButton testId={testId} courseId={courseId} />
          </div>
        )}
      </header>

      {
        await GradingPageShell({
          test,
          courseId,
          basePath: `/admin/courses/${courseId}/tests/${testId}/grading`,
          selection: { mode, studentId, questionId, sort },
        })
      }
    </div>
  );
}
