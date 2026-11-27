import type { SaveAndNextNavigation } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { CompactGradeForm } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { GradePanelShell } from "src/app/admin/(dashboard)/grading/page-body/grade-panel.ui";
import { UnsavedGradeProvider } from "src/app/admin/(dashboard)/grading/page-body/unsaved-grade.state";
import { BlankAnswerNote } from "src/components/blank-answer-note.ui";
import { McReadOnlyScore } from "src/components/mc-read-only-score.ui";
import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import { isMcQuestion, type Question } from "src/lib/question-service";
import type { TestStatus } from "src/lib/test-status-service";
import { hasSubmitted } from "src/lib/test-status-service";

interface GradePanelProps {
  testId: string;
  courseId: string;
  student: { id: string; name: string; username: string };
  question: Question;
  /** The student's latest answer, or undefined when there is none. */
  answer: StudentAnswer | undefined;
  /** The answer has a photo to grade. */
  hasPhotos: boolean;
  /** The saved grade, or undefined when there is none. */
  grade: Grade | undefined;
  status: TestStatus;
  saveAndNext?: SaveAndNextNavigation;
  /** What the AI grading job is doing, shown under the panel's title. */
  aiJobNotes?: React.ReactNode;
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
  courseId,
  student,
  question,
  answer,
  hasPhotos,
  grade,
  status,
  saveAndNext,
  aiJobNotes,
  children,
  overallFeedback,
}: GradePanelProps) {
  const isSubmitted = hasSubmitted(status);
  const score = grade?.score ?? null;
  const gradable =
    !isMcQuestion(question) &&
    (answer?.type === "free_text" ? !!answer.text : hasPhotos);

  function renderBody() {
    if (isMcQuestion(question)) {
      return (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <McReadOnlyScore
            selectedIds={answer?.type === "mc" ? answer.selectedIds : []}
            score={score}
            isSubmitted={isSubmitted}
          />
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
          questionTitle={question.title}
          questionOrder={question.order}
          existingScore={score}
          existingFeedback={grade?.feedback ?? null}
          existingSolution={grade?.solution ?? null}
          studentStatus={status}
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
      >
        {renderBody()}
      </GradePanelShell>
    </UnsavedGradeProvider>
  );
}
