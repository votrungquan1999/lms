import { AiGradingFailedNote } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grading-failed-note.ui";
import { AiGradingInProgressNote } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grading-in-progress-note.ui";
import { AiSuggestionPanel } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-suggestion-panel";
import type { SaveAndNextNavigation } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { OverallFeedbackForm } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { PendingAiGradingRefresher } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/pending-ai-grading-refresher.ui";
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
  getAiGradeJobService,
  getAiGradeService,
  getAnnotationService,
  getTestFeedbackService,
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";
import { aiJobState } from "./ai-job-state";
import type { FinishView } from "./finish-panel.ui";
import { gradingRouteKind } from "./href";

interface GradingDetailQuestionProps {
  test: Test;
  courseId: string;
  /** The page's school — never resolved here. */
  schoolId: string;
  /** The question on screen. */
  question: Question;
  /** The student whose answer is on screen. */
  student: { id: string; name: string; username: string };
  /** Base path the page is rendered at (no query string). */
  basePath: string;
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
  basePath,
  needsOnly = false,
  screen,
  finish,
}: GradingDetailQuestionProps) {
  const testId = test.id;
  // Mint presigned GET URLs for the question's media so the grader sees exactly what the student saw.
  const [question] = await attachQuestionMediaUrls([focused]);

  const status = screen.pairs.get(student.id)?.status ?? TestStatus.NotStarted;
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
    mode: "question",
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
    routeKind: gradingRouteKind(basePath),
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

  return (
    <div
      data-testid={`student-card-${student.id}`}
      data-student-name={student.name}
      className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_24rem] grid-rows-[minmax(0,1fr)] gap-4"
    >
      <div
        data-testid="grading-answer-scroll"
        className="min-h-0 min-w-0 space-y-4 overflow-y-auto"
      >
        <AnswerPane
          testId={testId}
          courseId={courseId}
          studentId={student.id}
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
        />
      </div>

      {finish ? (
        finish.panel
      ) : (
        <GradePanel
          testId={testId}
          testTitle={test.title}
          courseId={courseId}
          student={student}
          question={question}
          answer={answer?.answer}
          hasPhotos={photos.length > 0}
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
            !test.isPractice && status === TestStatus.Submitted ? (
              // Remounts with the job, so a "started" message does not outlive its job.
              <MoreMenu
                key={aiJob.key}
                testId={testId}
                courseId={courseId}
                studentId={student.id}
                offerAutoGrade={suggestionsByQuestion.size === 0}
                offerRegenerateAll={suggestionsByQuestion.size > 0}
                aiGradingStartedAt={aiJob.startedAt}
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
  );
}
