import { AnnotationTool } from "src/app/admin/(dashboard)/grading/page-body/annotation-tool";
import { CompareWithAiFix } from "src/app/admin/(dashboard)/grading/page-body/compare-with-ai-fix";
import { BlankAnswerNote } from "src/components/blank-answer-note.ui";
import { McAnswerChips } from "src/components/mc-answer-chips";
import { McReadOnlyScore } from "src/components/mc-read-only-score.ui";
import { StudentQuestionCard } from "src/components/student-question-card.ui";
import type { AnnotationEntry } from "src/lib/annotation-service";
import type { AnswerImage } from "src/lib/answer-image-urls";
import type { StudentAnswer } from "src/lib/answer-service";
import { pluralize } from "src/lib/pluralize";
import { isMcQuestion, type Question } from "src/lib/question-service";

interface AnswerPaneProps {
  testId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  /** The question with its media URLs already minted. */
  question: Question;
  /** The student's latest answer, or undefined when there is none. */
  answer: StudentAnswer | undefined;
  /** The saved score, or null when there is no grade. */
  score: number | null;
  /** The student has handed in. */
  isSubmitted: boolean;
  /** The answer photos with minted URLs; empty unless the answer is a photo answer. */
  photos: AnswerImage[];
  annotations: AnnotationEntry[];
  /** Students can already see the correct answers. */
  correctAnswersVisible: boolean;
  /** The latest AI suggestion's fixed answer; absent when there is none. */
  aiFix?: string;
}

/**
 * The left pane: one question as the student saw it, her answer, and for a
 * written question a folded model answer.
 */
export function AnswerPane({
  testId,
  courseId,
  studentId,
  studentName,
  question,
  answer,
  score,
  isSubmitted,
  photos,
  annotations,
  correctAnswersVisible,
  aiFix,
}: AnswerPaneProps) {
  const modelAnswer =
    question.type === "free_text" ? question.referenceAnswer?.trim() : "";

  function renderAnswer() {
    if (isMcQuestion(question)) {
      const selectedIds = answer?.type === "mc" ? answer.selectedIds : [];
      return (
        <div className="space-y-2">
          <McAnswerChips
            selectedIds={selectedIds}
            options={question.options}
            colorPicks={true}
            showMissedCorrect={false}
          />
          <McReadOnlyScore
            selectedIds={selectedIds}
            score={score}
            isSubmitted={isSubmitted}
          />
        </div>
      );
    }

    if (answer?.type === "image" && photos.length > 0) {
      return (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Student Answer:
          </p>
          <AnnotationTool
            key={`${studentId}:${question.id}`}
            testId={testId}
            courseId={courseId}
            questionId={question.id}
            studentId={studentId}
            photos={photos}
            initialAnnotations={annotations}
          />
        </div>
      );
    }

    if (answer?.type === "free_text" && answer.text) {
      const lines = answer.text.split("\n").length;
      return (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Student Answer ·{" "}
            <span data-testid="answer-line-count">
              {lines} {pluralize(lines, "line")}
            </span>
          </p>
          <pre className="whitespace-pre-wrap wrap-anywhere rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {answer.text}
          </pre>
          {aiFix && (
            <CompareWithAiFix
              studentName={studentName}
              studentAnswer={answer.text}
              aiFix={aiFix}
            />
          )}
        </div>
      );
    }

    return <BlankAnswerNote isSubmitted={isSubmitted} score={score} />;
  }

  return (
    <StudentQuestionCard question={question}>
      {renderAnswer()}
      {modelAnswer && (
        <details data-testid="model-answer" className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {correctAnswersVisible
              ? "Model answer · students can see it"
              : "Model answer · students see it once correct answers are shown"}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{modelAnswer}</p>
        </details>
      )}
    </StudentQuestionCard>
  );
}
