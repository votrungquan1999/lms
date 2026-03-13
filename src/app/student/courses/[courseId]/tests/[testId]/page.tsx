import Link from "next/link";
import { notFound } from "next/navigation";
import { Separator } from "src/components/ui/separator";
import {
  getAnswerService,
  getGradeService,
  getPageGuard,
  getQuestionService,
  getTestFeedbackService,
  getTestService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { AnswerForm } from "./answer-form";
import { DiffViewer } from "./diff-viewer";
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

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const answerService = await getAnswerService();
  const latestAnswers = await answerService.getLatestAnswers(
    testId,
    session.studentId,
  );
  const answerMap = new Map(
    latestAnswers.map((a) => [a.questionId, a.answer]),
  );

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
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-5xl">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link
            href={`/student/courses/${courseId}`}
            className="hover:underline"
          >
            ← Back to Course
          </Link>
        </nav>
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
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {question.content}
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
                  <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold">
                        Score: {grade.score}/100
                      </span>
                    </div>
                    {grade.feedback && (
                      <p className="text-sm text-muted-foreground">
                        {grade.feedback}
                      </p>
                    )}
                    {grade.solution && studentAnswer && (
                      <div className="mt-3">
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
    </main>
  );
}
