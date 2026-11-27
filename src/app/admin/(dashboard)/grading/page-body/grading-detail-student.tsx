import { AiGradingFailedNote } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grading-failed-note.ui";
import { AiGradingInProgressNote } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grading-in-progress-note.ui";
import { AiSuggestionPanel } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-suggestion-panel";
import { AutoGradeWithAiButton } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/auto-grade-with-ai-button";
import {
  OverallFeedbackForm,
  RequestRedoButton,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { PendingAiGradingRefresher } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/pending-ai-grading-refresher.ui";
import { ReleaseGradeForStudentControl } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/release-grade-for-student";
import { AnswerPane } from "src/app/admin/(dashboard)/grading/page-body/answer-pane";
import { GradePanel } from "src/app/admin/(dashboard)/grading/page-body/grade-panel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { AiGradeJobStatus } from "src/lib/ai-grade-job-service";
import {
  type AiGradeSuggestion,
  CollectOutcomeKind,
} from "src/lib/ai-grade-types";
import { attachAnswerImageUrls } from "src/lib/answer-image-urls";
import { attachQuestionMediaUrls } from "src/lib/question-media-urls";
import { isMcQuestion } from "src/lib/question-service";
import {
  getAiGradeJobService,
  getAiGradeService,
  getAnnotationService,
  getAnswerService,
  getGradeService,
  getQuestionService,
  getRedoRequestService,
  getTestFeedbackService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";
import { hasSubmitted, TestStatus } from "src/lib/test-status-service";
import { StudentStatusBadge } from "../student-status-badge";
import type { GradingSort } from "./grading-page-body.type";
import { QuestionRow } from "./question-row";

interface GradingDetailStudentProps {
  test: Test;
  courseId: string;
  /** The page's school — never resolved here. */
  schoolId: string;
  student: { id: string; name: string; username: string };
  /** The question whose answer is on screen; the first question when absent or not one of the test's. */
  questionId?: string;
  /** Base path the page is rendered at (no query string). */
  basePath: string;
  /** Current `?sort=` value, preserved in the Save & Next redirect target. */
  sort?: GradingSort;
}

/**
 * Renders one student's answer to one question in the shell's right pane:
 * the per-student controls (request redo, release grades, auto-grade with
 * AI), the answer pane, its grade form and AI suggestions, and the overall
 * feedback form.
 */
export async function GradingDetailStudent({
  test,
  courseId,
  schoolId,
  student,
  questionId,
  basePath,
  sort,
}: GradingDetailStudentProps) {
  const testId = test.id;

  const questionService = await getQuestionService(schoolId);
  const questions = await questionService.listQuestions(testId);
  const liveQuestionIds = new Set(questions.map((q) => q.id));

  // Status first: it hands in an expired attempt, so the grades and redo read below see it.
  const testStatusService = await getTestStatusService(schoolId);
  const status = await testStatusService.getStatus(
    testId,
    student.id,
    questions.length,
  );

  const answerService = await getAnswerService(schoolId);
  // A question can be deleted after a student answers it — that answer must
  // not keep counting toward progress/status once the question is gone.
  const latestAnswers = (
    await answerService.getLatestAnswers(testId, student.id)
  ).filter((a) => liveQuestionIds.has(a.questionId));
  const rawAnswerMap = new Map(
    latestAnswers.map((a) => [a.questionId, a.answer]),
  );
  const latestAnswerIdByQuestion = new Map(
    latestAnswers.map((a) => [a.questionId, a.id]),
  );

  const gradeService = await getGradeService(schoolId);
  const grades = (await gradeService.getGrades(testId, student.id)).filter(
    (g) => liveQuestionIds.has(g.questionId),
  );
  const gradeMap = new Map(grades.map((g) => [g.questionId, g]));

  // The selected question, with its pictures and (for a photo answer) the
  // answer photos and the marks drawn on them.
  const selected = questions.find((q) => q.id === questionId) ?? questions[0];
  const [selectedQuestion] = selected
    ? await attachQuestionMediaUrls([selected])
    : [];
  const selectedAnswer = selectedQuestion
    ? rawAnswerMap.get(selectedQuestion.id)
    : undefined;
  const selectedGrade = selectedQuestion
    ? gradeMap.get(selectedQuestion.id)
    : undefined;
  const photos =
    selectedAnswer?.type === "image"
      ? await attachAnswerImageUrls(selectedAnswer.mediaKeys)
      : [];
  const annotations =
    selectedQuestion && selectedAnswer?.type === "image"
      ? await (await getAnnotationService(schoolId)).getAnnotations(
          testId,
          selectedQuestion.id,
          student.id,
        )
      : [];

  const testFeedbackService = await getTestFeedbackService(schoolId);
  const testFeedback = await testFeedbackService.getTestFeedback(
    testId,
    student.id,
  );

  const redoRequestService = await getRedoRequestService(schoolId);
  const activeRedoRequest = await redoRequestService.getActiveRedoRequest(
    testId,
    student.id,
  );

  const testSubmissionService = await getTestSubmissionService(schoolId);
  const activeSubmission = await testSubmissionService.getActiveSubmission(
    testId,
    student.id,
  );

  const aiGradeService = await getAiGradeService(schoolId);
  // Before the first suggestions read, so a finished job shows up in this render.
  const collected = await aiGradeService.collectRunnerResult(
    testId,
    student.id,
  );
  const aiSuggestionsByQuestion = await aiGradeService.getSuggestionsForStudent(
    testId,
    student.id,
  );

  const latestAiJob = await (
    await getAiGradeJobService(schoolId)
  ).getLatestForStudent(testId, student.id);
  // The notes and the refresher follow the job, not the submission status: a
  // fully hand-graded submission still has a job whose result will arrive.
  // Practice tests never get an AI job.
  // A render that lost the claim saw the job end before the winner's rows were
  // readable, so it counts as in progress for one more refresh.
  const aiGradingStartedAt =
    !test.isPractice &&
    latestAiJob !== null &&
    (latestAiJob.status === AiGradeJobStatus.Pending ||
      collected.kind === CollectOutcomeKind.ClaimedElsewhere)
      ? latestAiJob.createdAt
      : null;

  // A later round (e.g. Gemini, which leaves no job row) supersedes the failed job.
  const hasSuggestionNewerThanJob =
    latestAiJob !== null &&
    [...aiSuggestionsByQuestion.values()]
      .flat()
      .some((suggestion) => suggestion.generatedAt > latestAiJob.createdAt);
  const aiGradingFailed =
    !test.isPractice &&
    latestAiJob?.status === AiGradeJobStatus.Failed &&
    !hasSuggestionNewerThanJob;
  // Remounts the AI triggers when the job changes, so a "started" message from
  // a click on the previous job does not linger.
  const aiJobStateKey = `${latestAiJob?.id ?? "none"}:${latestAiJob?.status ?? "none"}`;

  const selectedSuggestions: AiGradeSuggestion[] = selectedQuestion
    ? (aiSuggestionsByQuestion.get(selectedQuestion.id) ?? [])
    : [];

  const hasAnswers = latestAnswers.length > 0;
  const hasActiveRedoRequest = activeRedoRequest !== null;

  // Ordered ids of the questions whose grade form offers Save & Next: written
  // answers with text (choice answers are read-only; blank and photo answers
  // get no Save & Next). Must match the grade form's gate and `saveAndNext`
  // below, or Save & Next could land on a question with no form.
  const formBearingQuestionIds = questions
    .filter((question) => {
      if (isMcQuestion(question)) {
        return false;
      }
      const rawAnswer = rawAnswerMap.get(question.id);
      return rawAnswer?.type === "free_text" && !!rawAnswer.text;
    })
    .map((question) => question.id)
    .join(",");

  return (
    <div
      data-testid={`student-card-${student.id}`}
      data-student-name={student.name}
      className="h-full min-h-0"
    >
      <Card className="h-full min-h-0">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-xl min-w-0 wrap-anywhere">
              {student.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                @{student.username}
              </span>
            </CardTitle>
            <div className="flex items-center gap-3">
              <StudentStatusBadge status={status} />
              {!test.isPractice && (
                <RequestRedoButton
                  testId={testId}
                  courseId={courseId}
                  studentId={student.id}
                  hasActiveRedoRequest={hasActiveRedoRequest}
                />
              )}
              {!test.isPractice && status === TestStatus.Submitted && (
                <AutoGradeWithAiButton
                  key={aiJobStateKey}
                  testId={testId}
                  courseId={courseId}
                  studentId={student.id}
                  status={status}
                  hasExistingSuggestions={aiSuggestionsByQuestion.size > 0}
                  aiGradingStartedAt={aiGradingStartedAt}
                />
              )}
              {aiGradingStartedAt !== null && (
                <AiGradingInProgressNote startedAt={aiGradingStartedAt} />
              )}
              {aiGradingFailed && <AiGradingFailedNote />}
              {aiGradingStartedAt !== null && <PendingAiGradingRefresher />}
              <ReleaseGradeForStudentControl
                test={test}
                courseId={courseId}
                studentId={student.id}
                submission={activeSubmission}
                status={status}
              />
            </div>
          </div>
        </CardHeader>
        {selectedQuestion && (
          <div className="px-4">
            <QuestionRow
              questions={questions}
              studentId={student.id}
              currentQuestionId={selectedQuestion.id}
              answers={rawAnswerMap}
              grades={gradeMap}
              handedIn={hasSubmitted(status)}
              isPractice={test.isPractice}
              basePath={basePath}
              sort={sort}
            />
          </div>
        )}
        <CardContent className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_24rem] grid-rows-[minmax(0,1fr)] gap-4">
          {selectedQuestion && (
            <div
              data-testid="grading-answer-scroll"
              className="min-h-0 space-y-4 overflow-y-auto"
            >
              <AnswerPane
                testId={testId}
                courseId={courseId}
                studentId={student.id}
                studentName={student.name}
                question={selectedQuestion}
                answer={selectedAnswer}
                photos={photos}
                annotations={annotations}
                correctAnswersVisible={
                  test.showCorrectAnswerAfterSubmit ||
                  test.correctAnswersReleasedAt !== null
                }
                aiFix={selectedSuggestions[0]?.solution}
              />
            </div>
          )}

          {selectedQuestion && (
            <GradePanel
              testId={testId}
              courseId={courseId}
              student={student}
              question={selectedQuestion}
              answer={selectedAnswer}
              hasPhotos={photos.length > 0}
              grade={selectedGrade}
              status={status}
              overallFeedback={
                hasAnswers && (
                  // Keyed by student so a typed draft never saves onto the next student.
                  <OverallFeedbackForm
                    key={student.id}
                    testId={testId}
                    courseId={courseId}
                    studentId={student.id}
                    studentName={student.name}
                    existingFeedback={testFeedback}
                  />
                )
              }
              saveAndNext={
                selectedAnswer?.type === "free_text"
                  ? {
                      candidateIds: formBearingQuestionIds,
                      currentStudentId: student.id,
                      returnPath: basePath,
                      mode: "student" as const,
                      sort,
                    }
                  : undefined
              }
            >
              {selectedQuestion.type === "free_text" &&
                selectedSuggestions.length > 0 && (
                  <AiSuggestionPanel
                    key={aiJobStateKey}
                    testId={testId}
                    courseId={courseId}
                    studentId={student.id}
                    questionId={selectedQuestion.id}
                    suggestions={selectedSuggestions}
                    latestAnswerId={
                      latestAnswerIdByQuestion.get(selectedQuestion.id) ?? null
                    }
                    regenerateDisabled={aiGradingStartedAt !== null}
                  />
                )}
            </GradePanel>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
