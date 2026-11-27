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
import { attachAnswerImageUrls } from "src/lib/answer-image-urls";
import { GradingMode } from "src/lib/grading-mode";
import type { GradingScreenRead } from "src/lib/grading-screen-read";
import {
  countStudentsToGradeOnQuestion,
  findNextAnswerToGrade,
  type NextAnswerInput,
} from "src/lib/next-answer-to-grade";
import { attachQuestionMediaUrls } from "src/lib/question-media-urls";
import type { Question } from "src/lib/question-service";
import {
  StudentReleaseOffer,
  studentReleaseOffer,
} from "src/lib/release-state";
import {
  getAiGradeJobService,
  getAiGradeService,
  getAnnotationService,
  getTestFeedbackService,
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";
import { hasSubmitted, TestStatus } from "src/lib/test-status-service";
import { cn } from "src/lib/utils";
import { aiJobState } from "./ai-job-state";
import type { FinishView } from "./finish-panel.ui";
import type { GradingRouteKind } from "./grading-page-body.type";

interface GradingDetailQuestionProps {
  test: Test;
  courseId: string;
  /** The page's school — never resolved here. */
  schoolId: string;
  /** The question on screen. */
  question: Question;
  /** The student whose answer is on screen. */
  student: { id: string; name: string; username: string };
  /** Which grading route the page is. */
  routeKind: GradingRouteKind;
  /** Keep "Needs grading only" on after Save & next. */
  needsOnly?: boolean;
  /** The screen's read of the test. */
  screen: GradingScreenRead;
  /** The finish panel that stands in for the grade panel, and the line under the answer. */
  finish?: FinishView;
}

/**
 * By question's main pane: one student's answer to the question on screen
 * with the same grade panel, AI suggestions and More menu as By student.
 */
export async function GradingDetailQuestion({
  test,
  courseId,
  schoolId,
  question: focused,
  student,
  routeKind,
  needsOnly = false,
  screen,
  finish,
}: GradingDetailQuestionProps) {
  const testId = test.id;
  // Mint presigned GET URLs for the question's media so the grader sees exactly what the student saw.
  const [question] = await attachQuestionMediaUrls([focused]);

  const pair = screen.pairs.get(student.id);
  const status = pair?.status ?? TestStatus.NotStarted;
  const releaseOffer = pair ? studentReleaseOffer(test, pair) : null;
  // An open redo puts her pair back to In progress, so a handed-in pair has none open.
  const redoOffer = !test.isPractice && hasSubmitted(status);
  const answer = screen.answers.get(student.id)?.get(question.id);
  const grade = screen.grades.get(student.id)?.get(question.id);
  const photos =
    answer?.answer.type === "image"
      ? await attachAnswerImageUrls(answer.answer.mediaKeys)
      : [];
  const annotations =
    answer?.answer.type === "image"
      ? await (await getAnnotationService(schoolId)).getAnnotations(
          testId,
          question.id,
          student.id,
        )
      : [];
  const testFeedback = await (
    await getTestFeedbackService(schoolId)
  ).getTestFeedback(testId, student.id);

  const aiGradeService = await getAiGradeService(schoolId);
  // Before the first suggestions read, so a finished job shows up in this render.
  const collected = await aiGradeService.collectRunnerResult(
    testId,
    student.id,
  );
  const suggestionsByQuestion = await aiGradeService.getSuggestionsForStudent(
    testId,
    student.id,
  );
  const aiJob = aiJobState({
    isPractice: test.isPractice,
    latestJob: await (await getAiGradeJobService(schoolId)).getLatestForStudent(
      testId,
      student.id,
    ),
    collected,
    suggestionsByQuestion,
  });
  const suggestions = suggestionsByQuestion.get(question.id) ?? [];

  // The label comes from the same search the Save & next action runs.
  const nextInput: NextAnswerInput = {
    mode: GradingMode.Question,
    students: screen.students,
    current: { studentId: student.id, questionId: question.id },
    questions: screen.questions,
    pairs: screen.pairs,
    answers: screen.answers,
    grades: screen.grades,
  };
  const next = findNextAnswerToGrade(nextInput);
  const nextStudent = screen.students.find((s) => s.id === next?.studentId);
  const nextQuestion = screen.questions.find((q) => q.id === next?.questionId);
  const answersLeft = countStudentsToGradeOnQuestion(nextInput, question.id);
  const saveAndNext: SaveAndNextNavigation = {
    routeKind,
    mode: GradingMode.Question,
    needsOnly,
    ...(next && nextStudent && next.questionId === question.id
      ? {
          label: `Save & next: ${nextStudent.name}`,
          leftLine: `${answersLeft} ${answersLeft === 1 ? "answer" : "answers"} left on Q${question.order}`,
        }
      : next && nextQuestion
        ? {
            label: `Save & next: Q${nextQuestion.order}`,
            leftLine: `Last Q${question.order} answer to grade`,
          }
        : {
            label: "Save & next",
            leftLine: "Nothing else in this test needs a grade",
          }),
  };

  const showGradePanel = !test.isPractice && !finish;

  return (
    <PhotoMarksScope
      active={showGradePanel && photos.length > 0}
      scopeKey={`${student.id}:${question.id}:${(grade?.updatedAt ?? grade?.gradedAt)?.toISOString()}`}
      initialAnnotations={annotations}
    >
      <div
        data-testid={`student-card-${student.id}`}
        data-student-name={student.name}
        className={cn(
          "grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 narrow:grid-cols-[minmax(0,1fr)] narrow:grid-rows-[minmax(0,1fr)_auto]",
          test.isPractice
            ? "grid-cols-[minmax(0,1fr)]"
            : "grid-cols-[minmax(0,1fr)_24rem]",
        )}
      >
        <div
          data-testid="grading-answer-scroll"
          className="min-h-0 min-w-0 space-y-4 overflow-y-auto"
        >
          <AnswerPane
            studentName={student.name}
            question={question}
            answer={answer?.answer}
            photos={photos}
            annotations={annotations}
            correctAnswersVisible={
              test.showCorrectAnswerAfterSubmit ||
              test.correctAnswersReleasedAt !== null
            }
            aiFix={suggestions[0]?.solution}
            gradeLine={finish?.gradeLine}
            isPractice={test.isPractice}
            marksEditable={showGradePanel}
          />
        </div>

        {test.isPractice ? null : finish ? (
          finish.panel
        ) : (
          <GradePanel
            testId={testId}
            testTitle={test.title}
            courseId={courseId}
            student={student}
            question={question}
            answer={answer?.answer}
            answerSavedAt={answer?.submittedAt}
            grade={grade}
            status={status}
            saveAndNext={saveAndNext}
            overallFeedback={
              (screen.answers.get(student.id)?.size ?? 0) > 0 && (
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
                  key={`${student.id}:${aiJob.key}`}
                  testId={testId}
                  courseId={courseId}
                  studentId={student.id}
                  offerAutoGrade={
                    status === TestStatus.Submitted &&
                    suggestionsByQuestion.size === 0
                  }
                  offerRegenerateAll={
                    status === TestStatus.Submitted &&
                    suggestionsByQuestion.size > 0
                  }
                  aiGradingStartedAt={aiJob.startedAt}
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
                {aiJob.startedAt !== null && (
                  <>
                    <AiGradingInProgressNote startedAt={aiJob.startedAt} />
                    <PendingAiGradingRefresher />
                  </>
                )}
                {aiJob.failed && <AiGradingFailedNote />}
              </>
            }
          >
            {question.type === "free_text" && suggestions.length > 0 && (
              <AiSuggestionPanel
                key={aiJob.key}
                testId={testId}
                courseId={courseId}
                studentId={student.id}
                questionId={question.id}
                suggestions={suggestions}
                latestAnswerId={answer?.id ?? null}
                savedGrade={
                  grade && {
                    score: grade.score,
                    feedback: grade.feedback,
                    solution: grade.solution ?? null,
                  }
                }
                studentAnswer={
                  answer?.answer.type === "free_text"
                    ? answer.answer.text
                    : undefined
                }
                regenerateDisabled={aiJob.startedAt !== null}
              />
            )}
          </GradePanel>
        )}
      </div>
    </PhotoMarksScope>
  );
}
