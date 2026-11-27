import { AiGradingFailedNote } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grading-failed-note.ui";
import { AiGradingInProgressNote } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grading-in-progress-note.ui";
import { AiSuggestionPanel } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-suggestion-panel";
import type { SaveAndNextNavigation } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { OverallFeedbackForm } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { PendingAiGradingRefresher } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/pending-ai-grading-refresher.ui";
import { PhotoMarksScope } from "src/app/admin/(dashboard)/grading/page-body/annotation-tool.state";
import { AnswerPane } from "src/app/admin/(dashboard)/grading/page-body/answer-pane";
import { GradePanel } from "src/app/admin/(dashboard)/grading/page-body/grade-panel";
import { MoreMenu } from "src/app/admin/(dashboard)/grading/page-body/more-menu";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import type { AiGradeSuggestion } from "src/lib/ai-grade-types";
import { attachAnswerImageUrls } from "src/lib/answer-image-urls";
import { GradingMode } from "src/lib/grading-mode";
import {
  type GradingScreenRead,
  readGradingScreen,
} from "src/lib/grading-screen-read";
import {
  countOtherStudentsToGrade,
  findNextAnswerToGrade,
  type NextAnswerInput,
  questionsToGrade,
} from "src/lib/next-answer-to-grade";
import { attachQuestionMediaUrls } from "src/lib/question-media-urls";
import {
  StudentReleaseOffer,
  studentReleaseOffer,
} from "src/lib/release-state";
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
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";
import { hasSubmitted, TestStatus } from "src/lib/test-status-service";
import { cn } from "src/lib/utils";
import { aiJobState } from "./ai-job-state";
import type { FinishView } from "./finish-panel.ui";
import { gradingRouteKind } from "./href";
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
  /** Show only the answers that need a grade in the question row. */
  needsOnly?: boolean;
  /** The screen's read of the test; read here when the caller has none. */
  screen?: GradingScreenRead;
  /** The finish panel that stands in for the grade panel, and the line under the answer. */
  finish?: FinishView;
}

/**
 * Renders one student's answer to one question in the shell's right pane:
 * the per-student controls (request redo, release grades), the answer pane,
 * its grade form with the More menu and AI suggestions, and the overall
 * feedback form.
 */
export async function GradingDetailStudent({
  test,
  courseId,
  schoolId,
  student,
  questionId,
  basePath,
  needsOnly = false,
  screen: givenScreen,
  finish,
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
  const answerSavedAt = new Map(
    latestAnswers.map((a) => [a.questionId, a.submittedAt]),
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

  const screen = givenScreen ?? (await readGradingScreen(schoolId, test));

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
  const aiJob = aiJobState({
    isPractice: test.isPractice,
    latestJob: latestAiJob,
    collected,
    suggestionsByQuestion: aiSuggestionsByQuestion,
  });
  const aiGradingStartedAt = aiJob.startedAt;
  const aiGradingFailed = aiJob.failed;
  const aiJobStateKey = aiJob.key;

  const selectedSuggestions: AiGradeSuggestion[] = selectedQuestion
    ? (aiSuggestionsByQuestion.get(selectedQuestion.id) ?? [])
    : [];

  const pair = screen.pairs.get(student.id);
  const releaseOffer = pair ? studentReleaseOffer(test, pair) : null;
  const hasAnswers = latestAnswers.length > 0;
  const hasActiveRedoRequest = activeRedoRequest !== null;
  // A practice test is not graded, so the answer fills the pane.
  const showGradePanel = !test.isPractice && !hasActiveRedoRequest && !finish;
  const redoOffer =
    !test.isPractice && hasSubmitted(status) && !hasActiveRedoRequest;

  // The label comes from the same search the Save & next action runs.
  const nextInput: NextAnswerInput = {
    mode: "student",
    students: screen.students,
    current: { studentId: student.id, questionId: selectedQuestion?.id ?? "" },
    questions: screen.questions,
    pairs: screen.pairs,
    answers: screen.answers,
    grades: screen.grades,
  };
  const next = selectedQuestion ? findNextAnswerToGrade(nextInput) : null;
  const nextQuestion = screen.questions.find((q) => q.id === next?.questionId);
  const otherStudentsWaiting = countOtherStudentsToGrade(nextInput, student.id);
  const answersLeftHere = questionsToGrade(nextInput, student.id).length;
  const saveAndNext: SaveAndNextNavigation = {
    routeKind: gradingRouteKind(basePath),
    mode: GradingMode.Student,
    needsOnly,
    ...(next && nextQuestion && next.studentId === student.id
      ? {
          label: `Save & next: Q${nextQuestion.order} ›`,
          leftLine: `${answersLeftHere} written ${answersLeftHere === 1 ? "answer" : "answers"} left for ${student.name}`,
        }
      : next
        ? {
            label: "Save & next student",
            leftLine: `${student.name}'s last answer to grade · ${otherStudentsWaiting} more ${otherStudentsWaiting === 1 ? "student" : "students"} waiting`,
          }
        : {
            label: "Save & next",
            leftLine: "Nothing else in this test needs a grade",
          }),
  };

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
          </div>
        </CardHeader>
        {selectedQuestion && (
          <div className="px-4">
            <QuestionRow
              questions={questions}
              studentId={student.id}
              currentQuestionId={selectedQuestion.id}
              answers={rawAnswerMap}
              answerSavedAt={answerSavedAt}
              grades={gradeMap}
              handedIn={hasSubmitted(status)}
              redoOpen={hasActiveRedoRequest}
              isPractice={test.isPractice}
              basePath={basePath}
              needsOnly={needsOnly}
            />
          </div>
        )}
        <PhotoMarksScope
          active={showGradePanel && photos.length > 0}
          scopeKey={`${student.id}:${selectedQuestion?.id}:${(selectedGrade?.updatedAt ?? selectedGrade?.gradedAt)?.toISOString()}`}
          initialAnnotations={annotations}
        >
          <CardContent
            className={cn(
              "grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4",
              test.isPractice
                ? "grid-cols-[minmax(0,1fr)]"
                : "grid-cols-[minmax(0,1fr)_24rem]",
            )}
          >
            {selectedQuestion && (
              <div
                data-testid="grading-answer-scroll"
                className="min-h-0 space-y-4 overflow-y-auto"
              >
                <AnswerPane
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
                  gradeLine={finish?.gradeLine}
                  isPractice={test.isPractice}
                  marksEditable={showGradePanel}
                />
              </div>
            )}

            {selectedQuestion && hasActiveRedoRequest && (
              <p className="text-sm text-muted-foreground">
                {student.name}'s answers are read-only while the redo is open.
                Grading opens again when {student.name} hands in.
              </p>
            )}

            {selectedQuestion && !hasActiveRedoRequest && finish?.panel}

            {selectedQuestion && showGradePanel && (
              <GradePanel
                testId={testId}
                testTitle={test.title}
                courseId={courseId}
                student={student}
                question={selectedQuestion}
                answer={selectedAnswer}
                answerSavedAt={answerSavedAt.get(selectedQuestion.id)}
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
                moreMenu={
                  !test.isPractice &&
                  (status === TestStatus.Submitted ||
                    releaseOffer !== null ||
                    redoOffer) ? (
                    // Remounts per student and job, so a release or "started" message never carries over.
                    <MoreMenu
                      key={`${student.id}:${aiJobStateKey}`}
                      testId={testId}
                      courseId={courseId}
                      studentId={student.id}
                      offerAutoGrade={
                        status === TestStatus.Submitted &&
                        aiSuggestionsByQuestion.size === 0
                      }
                      offerRegenerateAll={
                        status === TestStatus.Submitted &&
                        aiSuggestionsByQuestion.size > 0
                      }
                      aiGradingStartedAt={aiGradingStartedAt}
                      requestRedo={
                        redoOffer
                          ? {
                              testTitle: test.title,
                              student,
                              submittedAt: pair?.submittedAt ?? null,
                            }
                          : undefined
                      }
                      releaseTo={
                        releaseOffer === null
                          ? undefined
                          : {
                              studentName: student.name,
                              released:
                                releaseOffer === StudentReleaseOffer.Released,
                            }
                      }
                    />
                  ) : undefined
                }
                aiJobNotes={
                  <>
                    {aiGradingStartedAt !== null && (
                      <>
                        <AiGradingInProgressNote
                          startedAt={aiGradingStartedAt}
                        />
                        <PendingAiGradingRefresher />
                      </>
                    )}
                    {aiGradingFailed && <AiGradingFailedNote />}
                  </>
                }
                saveAndNext={saveAndNext}
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
                        latestAnswerIdByQuestion.get(selectedQuestion.id) ??
                        null
                      }
                      savedGrade={
                        selectedGrade && {
                          score: selectedGrade.score,
                          feedback: selectedGrade.feedback,
                          solution: selectedGrade.solution ?? null,
                        }
                      }
                      studentAnswer={
                        selectedAnswer?.type === "free_text"
                          ? selectedAnswer.text
                          : undefined
                      }
                      regenerateDisabled={aiGradingStartedAt !== null}
                    />
                  )}
              </GradePanel>
            )}
          </CardContent>
        </PhotoMarksScope>
      </Card>
    </div>
  );
}
