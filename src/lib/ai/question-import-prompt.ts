import type { DraftQuestion } from "./question-import-schema";

const SYSTEM_RULES = [
  "You are an assistant that converts a teacher's exam document into structured test questions for a learning-management system.",
  "Split the document into individual questions, in the order they appear.",
  "A passage followed by lettered sub-parts (a, b, c, d) is one question. Never split it into one question per sub-part, never repeat the passage, and never add a lead-in of your own. Sub-parts the student answers in writing stay in that question's content; true/false statements the student ticks become that question's options (\"multi_select\", each true statement marked correct).",
  'For each question, classify its "type" as exactly one of: "free_text" (the student writes a free-form answer), "single_select" (the student picks exactly one option), or "multi_select" (the student may pick several options).',
  'For single_select and multi_select questions, extract every option\'s text and whether it is marked correct (look for markers such as a checkmark, bold text, underline, or a line like "Answer: B").',
  'Text the teacher highlighted appears wrapped in <mark color="…">…</mark>. Teachers usually mark the answer key by highlighting each correct option (or each true statement) in one consistent colour across the whole document — treat an option highlighted in that consistent colour as correct. A colour used only here and there, or on words inside a question, is emphasis, not an answer.',
  "Never copy the <mark> tags into any title, content, option text, referenceAnswer, or explanation — output only the plain text inside them.",
  "Pictures appear as [image N] at the spot they sit in the document. Keep each [image N] exactly where it appears in any text you copy (title, content, option text, referenceAnswer, explanation); never move, renumber, or drop one. A marker just before a question's label belongs to that question, so copy it into that question's text. Copy every marker, even one no question seems to use. A text that is only a picture keeps a short label beside its marker, such as the option letter or \"Hình 1\".",
  "Never create a question just for a picture: a picture with no question text of its own goes into the question that uses it, or nowhere. Never leave a title, content, or option text empty.",
  "Preserve each question's original wording; do not rephrase or summarize it.",
  'Each question\'s "content" is shown to students as Markdown: keep the document\'s line breaks (one step, statement, or list item per line, never merged into one paragraph), and write any table as a Markdown table — a header row, a "| --- |" separator row, then one row per line. Put a blank line before and after every list and table, or the line after it is swallowed into the last bullet or table row.',
  'Every line break in any text field must be a real line break. Never write the two characters backslash and "n" (\\n) as text in place of one — a table or list written that way collapses into a single line.',
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
  currentQuestion: DraftQuestion,
  correctionNote: string,
): string {
  // The model sees pictures only as markers, so the list is named in words, not printed in the JSON.
  const { imageNumbers = [], ...draft } = currentQuestion;
  const currentPictures = imageNumbers.length
    ? `The question's current pictures: ${imageNumbers.map((n) => `[image ${n}]`).join(", ")}. Their markers are not in the extraction above; write a picture's marker back where it sits in the question to keep it, and leave it out to drop that picture. Copy only the markers that sit in this question's own text.`
    : undefined;
  return [
    SYSTEM_RULES,
    "Document text:",
    documentText,
    "This question was already extracted once. The teacher reviewed it and found a problem, so it needs to be re-read — the rest of the document's questions are unaffected.",
    `Current extraction of this one question: ${JSON.stringify(draft)}`,
    ...(currentPictures ? [currentPictures] : []),
    `Teacher's correction note — what was wrong: ${correctionNote}`,
    'Re-read the document and produce a corrected version of this ONE question that addresses the correction note. Respond with JSON of the form { "question": { "title": string, "content": string, "type": "free_text" | "single_select" | "multi_select", "options"?: [{ "text": string, "isCorrect": boolean }], "referenceAnswer"?: string, "explanation"?: string } }. Omit "referenceAnswer"/"explanation" entirely when the document gives none — never return an empty string for either.',
  ].join("\n\n");
}
