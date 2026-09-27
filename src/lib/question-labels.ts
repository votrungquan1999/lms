import type { McGradingStrategy, QuestionType } from "src/lib/question-service";
import type { AnswerRevealMode } from "src/lib/test-service";

/**
 * One name per question type, used everywhere a type is shown or chosen
 * (add forms, edit panels, the question list, pool previews) so a type
 * never reads differently on two screens.
 */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  free_text: "Free Text",
  single_select: "Single Select",
  multi_select: "Multi Select",
  image_answer: "Image Answer",
};

/**
 * One heading and one wording per answer-display option, used by the test
 * settings panel and every per-question override (add forms, edit panels).
 */
export const ANSWER_REVEAL_MODE_HEADING = "How students see their answer";

/** The explicit "leave this to the test" choice — one wording everywhere it's offered. */
export const ANSWER_REVEAL_MODE_INHERIT_LABEL = "Use the test's setting";

export const ANSWER_REVEAL_MODE_LABELS: Record<AnswerRevealMode, string> = {
  diff: "Side-by-side comparison",
  plain: "Correct answer written out plainly",
};

/**
 * One wording per multi-select grading strategy, used by the
 * question list's "Grading:" line and the Add forms/edit panels' own radio.
 */
export const MC_GRADING_STRATEGY_LABELS: Record<McGradingStrategy, string> = {
  all_or_nothing: "All-or-nothing",
  partial: "Partial credit",
};
