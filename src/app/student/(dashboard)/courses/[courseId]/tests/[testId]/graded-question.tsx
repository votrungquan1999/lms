import { AnnotationOverlay } from "src/components/annotation-overlay";
import { MarkdownContent } from "src/components/markdown-content";
import { McAnswerChips } from "src/components/mc-answer-chips";
import { QuestionMedia } from "src/components/question-media.ui";
import { Badge } from "src/components/ui/badge";
import type { AnnotationEntry } from "src/lib/annotation-service";
import type { AnswerImage } from "src/lib/answer-image-urls";
import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import {
  isMcQuestion,
  type McOption,
  type Question,
} from "src/lib/question-service";
import type { AnswerRevealMode } from "src/lib/test-service";
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
  /** Effective free-text reveal mode: question override, or the test default. */
  mode: AnswerRevealMode;
  correctAnswersVisible: boolean;
  testStatus: TestStatus;
  /** Minted photo URLs for image answers (empty/undefined otherwise). */
  answerImages?: AnswerImage[];
  /** Grader's annotations over the image answer, loaded separately from the grade. */
  annotations?: AnnotationEntry[];
}

/**
 * Renders one graded question as a collapsible card. Perfect scores collapse to
 * a summary row (with a feedback preview); non-perfect scores open with the
 * prompt tucked behind a toggle and the answer + grade panels shown. The grade
 * panel is tinted by score band. The student-vs-solution diff (diff mode only)
 * is omitted when the answer matches the solution, when the mode is "plain",
 * or while correct answers are not yet released to students.
 * @param props - See {@link GradedQuestionProps}.
 */
export function GradedQuestion({
  question,
  studentAnswer,
  grade,
  isMC,
  options,
  mode,
  correctAnswersVisible,
  testStatus,
  answerImages,
  annotations,
}: GradedQuestionProps) {
  const tone = getScoreTone(grade.score);
  const studentText =
    studentAnswer?.type === "free_text" ? studentAnswer.text : "";

  // The diff already shows the student's answer on its left side, so when it is
  // displayed we skip the separate "Your Answer" panel to avoid duplication.
  // `correctAnswersVisible` closes this off pre-release (D31) — previously
  // this rendered `grade.solution` unconditionally, leaking it on tests where
  // the teacher had switched correct answers off.
  const showDiff =
    !isMC &&
    mode === "diff" &&
    correctAnswersVisible &&
    !!grade.solution &&
    !!studentAnswer &&
    !isTextEquivalent(studentText, grade.solution);

  // Narrow on the discriminant once (TS needs it to access `.explanation`,
  // which only MC and free_text carry, not image_answer), then gate
  // server-side (like grade.feedback) so the string never enters the RSC
  // payload when the reveal is closed — mirrors the isCorrect strip. Same
  // parity rule applies here as the plain-mode correct answer above: gate on
  // the type discriminant, never `!isMC`.
  const explanationText =
    isMcQuestion(question) || question.type === "free_text"
      ? question.explanation
      : undefined;
  const showExplanation = correctAnswersVisible && !!explanationText;

  // Plain mode's alternative to the diff: the correct answer written out as
  // text. Gated on the free_text discriminant explicitly (never `!isMC`,
  // which is also true for image_answer questions that can carry a
  // teacher-written `grade.solution`) and on `correctAnswersVisible` from
  // birth, since this new panel has no pre-existing leak to preserve.
  // Falls back to the question's own referenceAnswer when the AI grader
  // omitted `solution` (a 100% score) — plain mode only; diff mode keeps
  // D10's no-fallback rule.
  const correctAnswerText =
    question.type === "free_text"
      ? (grade.solution ?? question.referenceAnswer ?? undefined)
      : undefined;
  const showCorrectAnswer =
    mode === "plain" && correctAnswersVisible && !!correctAnswerText;

  return (
    <GradedQuestionShell
      questionLabel={`Question ${question.order}: ${question.title}`}
      // A perfect score normally collapses the card, but not when plain mode
      // has a correct answer to show (E2) — otherwise a full-marks student
      // never sees it without opening the card themselves.
      defaultOpen={grade.score !== 100 || showCorrectAnswer}
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
        <QuestionMedia media={question.media} />
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
          ) : studentAnswer.type === "image" ? (
            <div className="grid gap-3">
              {(answerImages ?? []).map((photo) => (
                <AnnotationOverlay
                  key={photo.key}
                  src={photo.url}
                  alt="Your submitted work"
                  strokes={
                    annotations?.find((a) => a.mediaKey === photo.key)
                      ?.strokes ?? []
                  }
                />
              ))}
            </div>
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
        {showExplanation && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Explanation
            </p>
            <p className="whitespace-pre-wrap text-sm">{explanationText}</p>
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
        {showCorrectAnswer && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Correct Answer
            </p>
            <p className="whitespace-pre-wrap text-sm">{correctAnswerText}</p>
          </div>
        )}
      </div>
    </GradedQuestionShell>
  );
}
