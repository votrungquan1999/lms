import { MarkdownContent } from "src/components/markdown-content";
import { QuestionMedia } from "src/components/question-media.ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import type {
  McOption,
  QuestionMedia as QuestionMediaItem,
  QuestionType,
} from "src/lib/question-service";

/**
 * The narrow slice of a question a student's card needs — deliberately no
 * answer key or weight, so callers can't leak what the card never shows.
 */
export interface StudentCardQuestion {
  id: string;
  order: number;
  title: string;
  content: string;
  type: QuestionType;
  options: McOption[];
  media: QuestionMediaItem[];
}

/**
 * A question as a student sees it: numbered title, formatted content and
 * pictures, then whatever the caller slots in below (answer controls, etc.).
 * @param question - The card's numbered header, content and pictures.
 * @param children - Content shown under the pictures.
 */
export function StudentQuestionCard({
  question,
  children,
}: {
  question: Pick<StudentCardQuestion, "order" | "title" | "content" | "media">;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg wrap-anywhere">
          Question {question.order}: {question.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MarkdownContent content={question.content} />
        <QuestionMedia media={question.media} />
        {children}
      </CardContent>
    </Card>
  );
}
