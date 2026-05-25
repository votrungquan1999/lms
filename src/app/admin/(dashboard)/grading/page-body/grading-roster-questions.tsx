import Link from "next/link";
import type { Question } from "src/lib/question-service";
import { GradingMode } from "./grading-page-body.type";
import { gradingHref } from "./href";

interface GradingRosterQuestionsProps {
  questions: Question[];
  basePath: string;
  activeQuestionId: string | null;
}

/**
 * Question-mode roster: lists questions (ordered by `question.order`) as
 * `<Link>`s that navigate to the same page with `?questionId=<id>`. The
 * active cell carries `aria-current="page"`. Mirrors the student-mode
 * roster's interaction model so the pivot swap is observable end-to-end.
 */
export function GradingRosterQuestions({
  questions,
  basePath,
  activeQuestionId,
}: GradingRosterQuestionsProps) {
  return (
    <ul className="space-y-1">
      {questions.map((question) => {
        const isActive = question.id === activeQuestionId;
        return (
          <li key={question.id}>
            <Link
              href={gradingHref({
                basePath,
                mode: GradingMode.Question,
                questionId: question.id,
              })}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className="block rounded-sm hover:bg-muted aria-[current=page]:bg-muted"
            >
              <div
                className="space-y-1 rounded-sm px-2 py-1.5"
                data-testid={`roster-question-cell-${question.id}`}
              >
                <p className="text-sm font-medium">
                  Q{question.order}. {question.title}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
