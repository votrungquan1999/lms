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
import { Progress } from "src/components/ui/progress";
import type { AnnotationEntry } from "src/lib/annotation-service";
import {
  type AnswerImage,
  attachAnswerImageUrls,
} from "src/lib/answer-image-urls";
import { attachQuestionMediaUrls } from "src/lib/question-media-urls";
import {
  getAnnotationService,
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
import { PageHeader } from "../../../../_ui/page-header.ui";
import { StatusBadge } from "../../../../_ui/status-badge.ui";
import { TestCountdown } from "./countdown.state";
import { StartTestGate } from "./start-test-gate";
import { TestQuestionsSection } from "./test-questions-section";

export const metadata = {
  title: "Test — LMS",
  description: "Answer test questions",
};

// Forced dynamic so each render mints fresh presigned media URLs.
export const dynamic = "force-dynamic";

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
  const questions = await attachQuestionMediaUrls(
    await questionService.listQuestions(testId),
  );

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

  // Per-question submission counts, for the practice "Attempt N" indicator.
  const attemptCountMap = await answerService.getAttemptCounts(
    testId,
    session.studentId,
  );

  // Per-question practice-mode reveal gate: open only once the test is a
  // practice test AND the student has answered that specific question.
  // Closed for every question when the test isn't practice (D8 fail-closed).
  const revealMap = new Map(
    questions.map((q) => [q.id, test.isPractice && answerMap.has(q.id)]),
  );

  // Scrub the authored referenceAnswer/explanation off any free_text
  // question whose reveal gate is closed, before it reaches any client
  // component — mirrors the MC isCorrect/safeOptions scrub in
  // test-questions-section.tsx.
  const revealedQuestions = questions.map((q) =>
    q.type === "free_text" && !revealMap.get(q.id)
      ? { ...q, referenceAnswer: undefined, explanation: undefined }
      : q,
  );

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

  // Mint photo URLs for image answers whose grade is revealed, plus the
  // grader's annotations (stored separately from the grade) over those photos.
  // Same reveal gate as grades — annotations stay hidden until release.
  const annotationService = await getAnnotationService();
  const answerImagesMap = new Map<string, AnswerImage[]>();
  const annotationsMap = new Map<string, AnnotationEntry[]>();
  for (const [questionId, ans] of answerMap) {
    if (ans.type === "image" && gradeMap.has(questionId)) {
      answerImagesMap.set(
        questionId,
        await attachAnswerImageUrls(ans.mediaKeys),
      );
      annotationsMap.set(
        questionId,
        await annotationService.getAnnotations(
          testId,
          questionId,
          session.studentId,
        ),
      );
    }
  }

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <PageHeader
        breadcrumb={
          <Breadcrumb>
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
        }
        title={test.title}
        description={test.description}
      >
        <div className="flex items-center gap-2">
          <StatusBadge status={testStatus} />
        </div>

        {activeRedoRequest && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            <p className="font-semibold">Redo Required ↩</p>
            <p className="mt-0.5 text-muted-foreground">
              Your teacher has requested that you redo this test. Please
              re-answer the questions and submit again.
            </p>
          </div>
        )}

        {average !== null && (
          <div className="rounded-md border bg-muted/50 p-3">
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
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {answerMap.size} / {questions.length} question
                {questions.length !== 1 ? "s" : ""} answered
              </span>
              <span className="font-medium">
                {Math.round((answerMap.size / (questions.length || 1)) * 100)}%
              </span>
            </div>
            <Progress
              value={(answerMap.size / (questions.length || 1)) * 100}
              className="h-2"
            />
          </div>
        )}
      </PageHeader>

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
            questions={revealedQuestions}
            answerMap={answerMap}
            gradeMap={gradeMap}
            answerImagesMap={answerImagesMap}
            annotationsMap={annotationsMap}
            testStatus={testStatus}
            isSubmitted={isSubmitted}
            hasActiveRedo={!!activeRedoRequest}
            canAnswer={canAnswer}
            correctAnswersVisible={correctAnswersVisible}
            isPractice={test.isPractice}
            revealMap={revealMap}
            attemptCountMap={attemptCountMap}
            gradeCount={grades.length}
          />
        </>
      )}
    </div>
  );
}
