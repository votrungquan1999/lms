import type { QuestionImportItem } from "./question-import-schema";

const SYSTEM_RULES = [
  "You are an assistant that converts a teacher's exam document into structured test questions for a learning-management system.",
  "Split the document into individual questions, in the order they appear.",
  'For each question, classify its "type" as exactly one of: "free_text" (the student writes a free-form answer), "single_select" (the student picks exactly one option), or "multi_select" (the student may pick several options).',
  'For single_select and multi_select questions, extract every option\'s text and whether it is marked correct (look for markers such as a checkmark, bold text, underline, or a line like "Answer: B").',
  "Preserve each question's original wording; do not rephrase or summarize it.",
  "Never translate a question into another language — keep it in the exact language the document is written in, even if that language is not English.",
  'If a question has a model answer or explanation written in the document, extract it into "referenceAnswer" or "explanation". If the document does not give one, omit that field — leave it blank rather than guessing.',
  "Never invent, fabricate, or make up a referenceAnswer or explanation that is not actually present in the document.",
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
    'Respond with JSON of the form { "questions": [{ "title": string, "content": string, "type": "free_text" | "single_select" | "multi_select", "options"?: [{ "text": string, "isCorrect": boolean }], "referenceAnswer"?: string, "explanation"?: string }, ...] }. Omit "referenceAnswer"/"explanation" entirely when the document gives none — never return an empty string for either.',
  ].join("\n\n");
}

/**
 * Builds the prompt sent to the LLM to re-read ONE already-extracted question,
 * addressing a teacher's correction note. Only this one question is returned —
 * the rest of the review list is never touched by a retry.
 * @param documentText - The full text extracted from the uploaded document.
 * @param currentQuestion - The question's current (possibly hand-edited) draft.
 * @param correctionNote - What the teacher says was wrong with it.
 * @returns A single user-prompt string for the LLM.
 */
export function buildQuestionRetryPrompt(
  documentText: string,
  currentQuestion: QuestionImportItem,
  correctionNote: string,
): string {
  return [
    SYSTEM_RULES,
    "Document text:",
    documentText,
    "This question was already extracted once. The teacher reviewed it and found a problem, so it needs to be re-read — the rest of the document's questions are unaffected.",
    `Current extraction of this one question: ${JSON.stringify(currentQuestion)}`,
    `Teacher's correction note — what was wrong: ${correctionNote}`,
    'Re-read the document and produce a corrected version of this ONE question that addresses the correction note. Respond with JSON of the form { "question": { "title": string, "content": string, "type": "free_text" | "single_select" | "multi_select", "options"?: [{ "text": string, "isCorrect": boolean }], "referenceAnswer"?: string, "explanation"?: string } }. Omit "referenceAnswer"/"explanation" entirely when the document gives none — never return an empty string for either.',
  ].join("\n\n");
}
