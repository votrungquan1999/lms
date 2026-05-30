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
import {
  getAnswerService,
  getCourseService,
  getGradeService,
  getPageGuard,
  getQuestionService,
  getRedoRequestService,
  getTestFeedbackService,
  getTestService,
  getTestStartService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { TestCountdown } from "./countdown.state";
import { StartTestGate } from "./start-test-gate";
import { TestQuestionsSection } from "./test-questions-section";

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

  // Atomic-reveal gate for MC correct answers. When closed, every option's
  // `isCorrect` is overwritten to `false` before reaching any client component,
  // so devtools / page-source inspection cannot recover the answer key.
  const correctAnswersVisible =
    test.showCorrectAnswerAfterSubmit || test.correctAnswersReleasedAt != null;

  const answerService = await getAnswerService();
  const latestAnswers = await answerService.getLatestAnswers(
    testId,
    session.studentId,
  );
  // Map questionId → StudentAnswer object
  const answerMap = new Map(latestAnswers.map((a) => [a.questionId, a.answer]));

  const testSubmissionService = await getTestSubmissionService();
  const isSubmitted = await testSubmissionService.isTestSubmitted(
    testId,
    session.studentId,
  );

  // ── Compute test status for atomic-reveal visibility checks ──────────────
  const testStatusService = await getTestStatusService();
  const testStatus = await testStatusService.getStatus(
    testId,
    session.studentId,
    questions.length,
  );

  // ── Fetch grades via visibility-aware methods ─────────────────────────────
  const gradeService = await getGradeService();
  const grades = await gradeService.getStudentGrades(
    testId,
    session.studentId,
    testStatus,
  );
  const gradeMap = new Map(grades.map((g) => [g.questionId, g]));

  const average = await gradeService.getStudentAverageScore(
    testId,
    session.studentId,
    testStatus,
  );

  const testFeedbackService = await getTestFeedbackService();
  const overallFeedback = await testFeedbackService.getTestFeedback(
    testId,
    session.studentId,
  );

  const redoRequestService = await getRedoRequestService();
  const activeRedoRequest = await redoRequestService.getActiveRedoRequest(
    testId,
    session.studentId,
  );

  // Student can answer if test is not submitted OR if there's an active redo request
  const canAnswer = !isSubmitted || !!activeRedoRequest;

  // ── Timed-test Start gate ────────────────────────────────────────────────
  // A timed test (timeLimitMinutes != null) that the student has not yet
  // started shows a Start gate instead of the questions.
  const testStartService = await getTestStartService();
  const activeStart = await testStartService.getActiveStart(
    testId,
    session.studentId,
  );
  // When non-null, the Start gate is shown and carries the (narrowed) limit;
  // null means the test is untimed or already started, so show the questions.
  const startGateMinutes =
    test.timeLimitMinutes !== null && activeStart === null
      ? test.timeLimitMinutes
      : null;

  // Once a timed test is started and still answerable, show a live countdown to
  // the true deadline (startedAt + limit). Null otherwise (untimed, not yet
  // started, or already submitted with no active redo).
  const countdownDeadlineMs =
    test.timeLimitMinutes !== null && activeStart !== null && canAnswer
      ? activeStart.startedAt.getTime() + test.timeLimitMinutes * 60_000
      : null;

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

        {activeRedoRequest && (
          <div className="mt-4 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200">
            <p className="font-semibold">Redo Required ↩</p>
            <p className="mt-0.5">
              Your teacher has requested that you redo this test. Please
              re-answer the questions and submit again.
            </p>
          </div>
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

        {startGateMinutes === null && !isSubmitted && questions.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {answerMap.size} / {questions.length} question
                {questions.length !== 1 ? "s" : ""} answered
              </span>
              <span className="font-medium">
                {Math.round((answerMap.size / (questions.length || 1)) * 100)}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{
                  width: `${(answerMap.size / (questions.length || 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </header>

      {startGateMinutes !== null ? (
        <StartTestGate
          testId={testId}
          courseId={courseId}
          timeLimitMinutes={startGateMinutes}
        />
      ) : (
        <>
          {countdownDeadlineMs !== null && (
            <div className="w-full max-w-5xl">
              <TestCountdown
                deadlineMs={countdownDeadlineMs}
                testId={testId}
                courseId={courseId}
              />
            </div>
          )}
          <TestQuestionsSection
            testId={testId}
            courseId={courseId}
            questions={questions}
            answerMap={answerMap}
            gradeMap={gradeMap}
            testStatus={testStatus}
            isSubmitted={isSubmitted}
            hasActiveRedo={!!activeRedoRequest}
            canAnswer={canAnswer}
            correctAnswersVisible={correctAnswersVisible}
            gradeCount={grades.length}
          />
        </>
      )}
    </div>
  );
}
