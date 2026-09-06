import { MarkdownContent } from "src/components/markdown-content";
import { QuestionMedia } from "src/components/question-media.ui";
import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { isMcQuestion, type Question } from "src/lib/question-service";
import type { AnswerRevealMode } from "src/lib/test-service";
import { QuestionEditPanel } from "./question-edit.state";

/** Renders a free_text question's reveal-mode override as read-only text; absent means it inherits the test's own choice. */
function answerRevealModeLabel(mode: AnswerRevealMode | undefined): string {
  if (mode === "diff") return "Side-by-side comparison";
  if (mode === "plain") return "Plain";
  return "Inherits test default";
}

/**
 * True when an MC question has no option marked correct (D32/D44): the AI
 * import path allows this rather than blocking the batch, so the admin list
 * is the only place this state becomes visible to the teacher. Exported so
 * the page header can derive a count from the same rule as the per-card badge.
 */
export function needsAnswerKey(question: Question): boolean {
  return isMcQuestion(question) && question.options.every((o) => !o.isCorrect);
}

/** Renders the distinct answered-student count (Step 23), singular-aware. */
function answeredStudentCountLabel(count: number): string {
  return count === 1
    ? "1 student has answered this"
    : `${count} students have answered this`;
}

/**
 * Server component: renders a list of questions for a test.
 */
export function QuestionList({
  questions,
  courseId,
  answeredCounts = new Map(),
}: {
  questions: Question[];
  courseId: string;
  /** Distinct answered-student count per question id (Step 23 / D49). Absent id means nobody has answered yet. */
  answeredCounts?: Map<string, number>;
}) {
  if (questions.length === 0) {
    return (
      <p className="text-center text-muted-foreground">
        No questions yet. Add one above or import from JSON.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Questions ({questions.length})</h2>
      {questions.map((question) => {
        const preview =
          question.content.length > 200
            ? `${question.content.slice(0, 200)}…`
            : question.content;
        const answeredCount = answeredCounts.get(question.id) ?? 0;

        return (
          <Card key={question.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="text-muted-foreground">#{question.order}</span>{" "}
                {question.title}
                {needsAnswerKey(question) && (
                  <Badge variant="destructive">Needs an answer key</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {answeredCount > 0 && (
                <p className="text-sm font-medium text-amber-600">
                  {answeredStudentCountLabel(answeredCount)}
                </p>
              )}
              <MarkdownContent content={preview} compact />
              <QuestionMedia media={question.media} />
              {question.type === "free_text" && (
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Model answer:</span>{" "}
                    {question.referenceAnswer ?? (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </p>
                  <p>
                    <span className="font-medium">Explanation:</span>{" "}
                    {question.explanation ?? (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </p>
                  <p>
                    <span className="font-medium">Shows answer:</span>{" "}
                    {answerRevealModeLabel(question.answerRevealMode)}
                  </p>
                </div>
              )}
              {isMcQuestion(question) && (
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Type:</span>{" "}
                    {question.type === "single_select"
                      ? "Single choice"
                      : "Multiple choice"}
                  </p>
                  <p>
                    <span className="font-medium">Grading:</span>{" "}
                    {question.mcGradingStrategy === "partial"
                      ? "Partial credit"
                      : "All-or-nothing"}
                  </p>
                  <ul className="list-inside list-disc">
                    {question.options.map((option) => (
                      <li key={option.id}>
                        {option.text}
                        {option.isCorrect && " (correct)"}
                      </li>
                    ))}
                  </ul>
                  {question.explanation && (
                    <p>
                      <span className="font-medium">Explanation:</span>{" "}
                      {question.explanation}
                    </p>
                  )}
                </div>
              )}
              {(question.type === "free_text" || isMcQuestion(question)) && (
                <QuestionEditPanel
                  question={question}
                  courseId={courseId}
                  answeredCount={answeredCount}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
