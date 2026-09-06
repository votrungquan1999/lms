const SYSTEM_RULES = [
  "You are an assistant that converts a teacher's exam document into structured test questions for a learning-management system.",
  "Split the document into individual questions, in the order they appear.",
  'For each question, classify its "type" as exactly one of: "free_text" (the student writes a free-form answer), "single_select" (the student picks exactly one option), or "multi_select" (the student may pick several options).',
  'For single_select and multi_select questions, extract every option\'s text and whether it is marked correct (look for markers such as a checkmark, bold text, underline, or a line like "Answer: B").',
  "Preserve each question's original wording; do not rephrase or summarize it.",
].join(" ");

/**
 * Builds the prompt sent to the LLM to extract structured questions from the
 * plain text of an uploaded document.
 * @param documentText - The plain text extracted from the uploaded document.
 * @returns A single user-prompt string for the LLM.
 */
export function buildQuestionImportPrompt(documentText: string): string {
  return [
    SYSTEM_RULES,
    "Document text:",
    documentText,
    'Respond with JSON of the form { "questions": [{ "title": string, "content": string, "type": "free_text" | "single_select" | "multi_select", "options"?: [{ "text": string, "isCorrect": boolean }] }, ...] }.',
  ].join("\n\n");
}
