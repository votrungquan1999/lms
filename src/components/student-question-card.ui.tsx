import { MarkdownContent } from "src/components/markdown-content";
import { QuestionMedia } from "src/components/question-media.ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import type {
  QuestionMedia as QuestionMediaItem,
  QuestionType,
} from "src/lib/question-service";

/** One choice as a student sees it. */
export interface StudentOption {
  id: string;
  text: string;
  /** Never set: a keyed `McOption` must not type-check here. */
  isCorrect?: never;
}

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
  options: StudentOption[];
  media: QuestionMediaItem[];
}

/**
 * A question as a student sees it: numbered title, formatted content and
 * pictures, then whatever the caller slots in below (answer controls, etc.).
 * @param question - The card's numbered header, content and pictures.
 * @param anchorId - Element id other parts of the page can link to.
 * @param children - Content shown under the pictures.
 */
export function StudentQuestionCard({
  question,
  anchorId,
  children,
}: {
  question: Pick<StudentCardQuestion, "order" | "title" | "content" | "media">;
  anchorId?: string;
  children?: React.ReactNode;
}) {
  return (
    // Scroll margin keeps a jumped-to card clear of the pinned navigator bar.
    <Card id={anchorId} className="scroll-mt-40">
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
