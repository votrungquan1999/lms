import { notFound } from "next/navigation";
import { GradingPageBody } from "src/app/admin/(dashboard)/grading/grading-page-body";
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
}: {
  params: Promise<{ courseId: string; testId: string }>;
}) {
  const { courseId, testId } = await params;

  const testService = await getTestService();
  const test = await testService.getTest(testId);
  if (!test || test.courseId !== courseId) {
    notFound();
  }

  const enrollmentService = await getEnrollmentService();
  const studentIds = await enrollmentService.listEnrollmentsByCourse(courseId);

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const body = await GradingPageBody({ test, courseId });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-3xl">
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

      {body}
    </div>
  );
}
