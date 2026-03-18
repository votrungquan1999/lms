import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "src/components/ui/breadcrumb";
import { Separator } from "src/components/ui/separator";
import {
  getAnswerService,
  getCourseService,
  getGradeService,
  getPageGuard,
  getQuestionService,
  getTestFeedbackService,
  getTestService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { AnswerForm } from "./answer-form";
import { DiffViewer } from "./diff-viewer";
import { MarkdownContent } from "src/components/markdown-content";
import { SubmitTestButton } from "./submit-test-button";

export const metadata = {
  title: "Test — LMS",
  description: "Answer test questions",
};

export default async function StudentTestDetailPage({
  params,
}: {
  params: Promise<{ courseId: string; testId: string }>;
}) {
  const { courseId, testId } = await params;

  const guard = await getPageGuard();
  const session = await guard.requireStudentLogin();
  await guard.requireEnrollment(courseId, session.studentId);

  const testService = await getTestService();
  const test = await testService.getTest(testId);
  if (!test || test.courseId !== courseId) {
    notFound();
  }

  const courseService = await getCourseService();
  const course = await courseService.getCourse(courseId);

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const answerService = await getAnswerService();
  const latestAnswers = await answerService.getLatestAnswers(
    testId,
    session.studentId,
  );
  const answerMap = new Map(latestAnswers.map((a) => [a.questionId, a.answer]));

  const testSubmissionService = await getTestSubmissionService();
  const isSubmitted = await testSubmissionService.isTestSubmitted(
    testId,
    session.studentId,
  );

  const gradeService = await getGradeService();
  const grades = await gradeService.getGrades(testId, session.studentId);
  const gradeMap = new Map(grades.map((g) => [g.questionId, g]));

  const average = await gradeService.getAverageScore(
    testId,
    session.studentId,
    questions.length,
  );
  const testFeedbackService = await getTestFeedbackService();
  const overallFeedback = await testFeedbackService.getTestFeedback(
    testId,
    session.studentId,
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-5xl">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/student/dashboard">My Courses</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/student/courses/${courseId}`}>
                  {course?.title ?? "Course"}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{test.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-3xl font-bold tracking-tight">{test.title}</h1>
        {test.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {test.description}
          </p>
        )}

        {average !== null && (
          <div className="mt-4 rounded-md border bg-muted/50 p-3">
            <p className="text-lg font-semibold">
              Average Score: {average.toFixed(1)} / 100
            </p>
            {overallFeedback && (
              <p className="mt-1 text-sm text-muted-foreground">
                {overallFeedback}
              </p>
            )}
          </div>
        )}
      </header>

      <section className="w-full max-w-5xl space-y-8">
        {questions.length > 0 ? (
          questions.map((question, index) => {
            const grade = gradeMap.get(question.id);
            const studentAnswer = answerMap.get(question.id);

            return (
              <div key={question.id} className="space-y-4">
                {index > 0 && <Separator />}
                <div>
                  <h2 className="text-lg font-semibold">
                    Question {question.order}: {question.title}
                  </h2>
                  <div className="mt-2">
                    <MarkdownContent content={question.content} />
                  </div>
                </div>

                {!isSubmitted && (
                  <AnswerForm
                    testId={testId}
                    courseId={courseId}
                    questionId={question.id}
                    existingAnswer={studentAnswer ?? ""}
                  />
                )}

                {isSubmitted && studentAnswer && (
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Your Answer:
                    </p>
                    <p className="whitespace-pre-wrap text-sm">
                      {studentAnswer}
                    </p>
                  </div>
                )}

                {grade && (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">
                        {grade.score}/100
                      </span>
                    </div>
                    {grade.feedback && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Teacher Feedback:
                        </p>
                        <p className="text-sm whitespace-pre-wrap">
                          {grade.feedback}
                        </p>
                      </div>
                    )}
                    {grade.solution && studentAnswer && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Diff Comparison:
                        </p>
                        <DiffViewer
                          studentAnswer={studentAnswer}
                          solution={grade.solution}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-center text-muted-foreground">
            No questions have been added to this test yet.
          </p>
        )}

        {!isSubmitted && questions.length > 0 && (
          <>
            <Separator />
            <SubmitTestButton testId={testId} courseId={courseId} />
          </>
        )}

        {isSubmitted && grades.length === 0 && (
          <div className="rounded-md border bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            Your test has been submitted and is waiting to be graded.
          </div>
        )}
      </section>
    </div>
  );
}
