import { MarkdownContent } from "src/components/markdown-content";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import type { Question } from "src/lib/question-service";

/**
 * Server component: renders a list of questions for a test.
 */
export function QuestionList({ questions }: { questions: Question[] }) {
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

        return (
          <Card key={question.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <span className="text-muted-foreground">#{question.order}</span>{" "}
                {question.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownContent content={preview} compact />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
