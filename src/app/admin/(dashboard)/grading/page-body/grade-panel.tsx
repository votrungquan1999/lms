import type { SaveAndNextNavigation } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { CompactGradeForm } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { GradePanelShell } from "src/app/admin/(dashboard)/grading/page-body/grade-panel.ui";
import { StillWritingGate } from "src/app/admin/(dashboard)/grading/page-body/still-writing-confirm";
import { UnmarkedChoiceAnswer } from "src/app/admin/(dashboard)/grading/page-body/unmarked-choice-answer.ui";
import { UnsavedGradeProvider } from "src/app/admin/(dashboard)/grading/page-body/unsaved-grade.state";
import { BlankAnswerNote } from "src/components/blank-answer-note.ui";
import { McReadOnlyScore } from "src/components/mc-read-only-score.ui";
import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import {
  answerNeedsGrade,
  isGradableAnswer,
  isUnmarkedChoiceAnswer,
} from "src/lib/next-answer-to-grade";
import { isMcQuestion, type Question } from "src/lib/question-service";
import { hasSubmitted, TestStatus } from "src/lib/test-status-service";

interface GradePanelProps {
  testId: string;
  testTitle: string;
  courseId: string;
  student: { id: string; name: string; username: string };
  question: Question;
  /** The student's latest answer, or undefined when there is none. */
  answer: StudentAnswer | undefined;
  /** When the answer was saved; omitted when not known. */
  answerSavedAt?: Date;
  /** The saved grade, or undefined when there is none. */
  grade: Grade | undefined;
  status: TestStatus;
  saveAndNext: SaveAndNextNavigation;
  /** What the AI grading job is doing, shown under the panel's title. */
  aiJobNotes?: React.ReactNode;
  /** The More menu, shown beside the panel's title. */
  moreMenu?: React.ReactNode;
  /** Shown under the form (the AI suggestion card). */
  children?: React.ReactNode;
  /** The student's overall-feedback row, shown last. */
  overallFeedback?: React.ReactNode;
}

/**
 * The grade panel for one answer: a score form for a written or photo answer,
 * and the read-only line for a choice or blank answer.
 */
export function GradePanel({
  testId,
  testTitle,
  courseId,
  student,
  question,
  answer,
  answerSavedAt,
  grade,
  status,
  saveAndNext,
  aiJobNotes,
  moreMenu,
  children,
  overallFeedback,
}: GradePanelProps) {
  const isSubmitted = hasSubmitted(status);
  const score = grade?.score ?? null;
  const gradable = isGradableAnswer(question, answer);

  // The panel is not shown while a redo is open, so the redo clause never applies here.
  const answerChanged =
    grade !== undefined &&
    answerNeedsGrade({
      question,
      answer,
      answeredAt: answerSavedAt ?? null,
      grade,
      redoOpen: false,
    });

  function renderBody() {
    if (isMcQuestion(question)) {
      return (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {isSubmitted && isUnmarkedChoiceAnswer(question, answer, grade) ? (
            <UnmarkedChoiceAnswer testId={testId} courseId={courseId} />
          ) : (
            <McReadOnlyScore
              selectedIds={answer?.type === "mc" ? answer.selectedIds : []}
              score={score}
              isSubmitted={isSubmitted}
            />
          )}
          {overallFeedback}
        </div>
      );
    }
    if (!gradable) {
      return (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <BlankAnswerNote isSubmitted={isSubmitted} score={score} />
          {overallFeedback}
        </div>
      );
    }
    const savedAt = grade?.updatedAt ?? grade?.gradedAt;
    return (
      <>
        {/* Keyed by answer so a draft never follows the teacher to another student or question. */}
        <CompactGradeForm
          key={`${student.id}:${question.id}`}
          formKey={savedAt?.toISOString()}
          testId={testId}
          courseId={courseId}
          questionId={question.id}
          studentId={student.id}
          gradedAnswerAt={answerSavedAt}
          existingScore={score}
          existingFeedback={grade?.feedback ?? null}
          existingSolution={grade?.solution ?? null}
          saveAndNext={saveAndNext}
          showQuickScores
        >
          {children}
          {overallFeedback}
        </CompactGradeForm>
      </>
    );
  }

  return (
    <UnsavedGradeProvider>
      <GradePanelShell
        questionOrder={question.order}
        questionTitle={question.title}
        studentName={student.name}
        studentUsername={student.username}
        aiJobNotes={aiJobNotes}
        answerChanged={answerChanged}
        headerAction={moreMenu}
      >
        <StillWritingGate
          studentId={student.id}
          studentName={student.name}
          testTitle={testTitle}
          stillWriting={status === TestStatus.InProgress}
        >
          {renderBody()}
        </StillWritingGate>
      </GradePanelShell>
    </UnsavedGradeProvider>
  );
}
