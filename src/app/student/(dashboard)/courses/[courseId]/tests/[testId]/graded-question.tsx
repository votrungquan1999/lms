import { MarkdownContent } from "src/components/markdown-content";
import { McAnswerChips } from "src/components/mc-answer-chips";
import { Badge } from "src/components/ui/badge";
import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import type { McOption, Question } from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";
import { isTextEquivalent } from "src/lib/text-normalization";
import { cn } from "src/lib/utils";
import { DiffViewer } from "./diff-viewer";
import {
  GradedQuestionShell,
  QuestionPromptCollapsible,
} from "./graded-question.ui";
import {
  getScoreTone,
  SCORE_BADGE_VARIANT,
  SCORE_PANEL_CLASS,
} from "./score-tone";

interface GradedQuestionProps {
  question: Question;
  studentAnswer: StudentAnswer | undefined;
  grade: Grade;
  isMC: boolean;
  /** Client-safe option list for MC questions (empty for free-text). */
  options: McOption[];
  correctAnswersVisible: boolean;
  testStatus: TestStatus;
}

/**
 * Renders one graded question as a collapsible card. Perfect scores collapse to
 * a summary row (with a feedback preview); non-perfect scores open with the
 * prompt tucked behind a toggle and the answer + grade panels shown. The grade
 * panel is tinted by score band, and the student-vs-solution diff is omitted
 * when the answer matches the solution (it would render as an empty diff).
 * @param props - See {@link GradedQuestionProps}.
 */
export function GradedQuestion({
  question,
  studentAnswer,
  grade,
  isMC,
  options,
  correctAnswersVisible,
  testStatus,
}: GradedQuestionProps) {
  const tone = getScoreTone(grade.score);
  const studentText =
    studentAnswer?.type === "free_text" ? studentAnswer.text : "";

  // The diff already shows the student's answer on its left side, so when it is
  // displayed we skip the separate "Your Answer" panel to avoid duplication.
  const showDiff =
    !isMC &&
    !!grade.solution &&
    !!studentAnswer &&
    !isTextEquivalent(studentText, grade.solution);

  return (
    <GradedQuestionShell
      questionLabel={`Question ${question.order}: ${question.title}`}
      defaultOpen={grade.score !== 100}
      commentPreview={grade.feedback || null}
      headerBadge={
        <span className="flex items-center gap-2">
          <Badge
            variant={SCORE_BADGE_VARIANT[tone]}
            className="text-sm font-semibold"
          >
            {grade.score}/100
          </Badge>
          {isMC && testStatus === TestStatus.Graded && (
            <span className="text-xs text-muted-foreground">(auto-graded)</span>
          )}
        </span>
      }
    >
      <QuestionPromptCollapsible>
        <MarkdownContent content={question.content} />
      </QuestionPromptCollapsible>

      {!showDiff && studentAnswer && (
        <div className="rounded-md border border-l-2 border-l-muted-foreground/30 bg-muted/40 p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your Answer
          </p>
          {studentAnswer.type === "mc" && isMC ? (
            <McAnswerChips
              selectedIds={studentAnswer.selectedIds}
              options={options}
              showCorrectAnswers={correctAnswersVisible}
            />
          ) : studentAnswer.type === "free_text" ? (
            <p className="whitespace-pre-wrap text-sm">{studentText}</p>
          ) : null}
        </div>
      )}

      <div
        className={cn(
          "rounded-md border p-4 space-y-3",
          SCORE_PANEL_CLASS[tone],
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Grade
        </p>
        {grade.feedback && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Teacher Feedback
            </p>
            <p className="whitespace-pre-wrap text-sm">{grade.feedback}</p>
          </div>
        )}
        {showDiff && grade.solution && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Diff Comparison
            </p>
            <DiffViewer studentAnswer={studentText} solution={grade.solution} />
          </div>
        )}
      </div>
    </GradedQuestionShell>
  );
}
