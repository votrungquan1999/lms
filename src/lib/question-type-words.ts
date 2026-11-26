import { pluralize } from "src/lib/pluralize";
import type { QuestionType } from "src/lib/question-service";

/** Teacher-facing words for a question type, in the order they are listed. */
const QUESTION_TYPE_WORDS: [QuestionType, string][] = [
  ["single_select", "single choice"],
  ["multi_select", "multiple choice"],
  ["free_text", "written"],
  ["image_answer", "photo"],
];

/**
 * Summarises a test's questions, e.g. "30 questions · 16 single choice · 8 written".
 * Only the types the test has are listed.
 * @param questionCount - How many live questions the test has.
 * @param typeCounts - Live questions per type.
 */
export function questionTypeSummary(
  questionCount: number,
  typeCounts: Record<QuestionType, number>,
): string {
  const parts = [`${questionCount} ${pluralize(questionCount, "question")}`];
  for (const [type, words] of QUESTION_TYPE_WORDS) {
    if (typeCounts[type] > 0) parts.push(`${typeCounts[type]} ${words}`);
  }
  return parts.join(" · ");
}
