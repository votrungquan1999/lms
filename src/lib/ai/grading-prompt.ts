import type {
  AiGradeBatchInput,
  AiGradeBatchOptions,
  AiGradeBatchPriorGrade,
} from "src/lib/ai/ai-client";

const SYSTEM_RULES = [
  "You are an assistant grader for a teacher's learning-management system.",
  "Grade each free-text answer on a 0-100 integer scale and produce short, surgical feedback.",
  "The teacher reviews your suggestions side-by-side; do not include preamble, sign-offs, or markdown formatting.",
  "Be specific about what the student got right or missed; avoid vague praise.",
  "Score 0 only for blank, off-topic, or incoherent answers. Score 100 for fully correct answers.",
].join(" ");

/**
 * Builds the prompt sent to the LLM for one batch of free-text questions.
 * Handles both the initial-generation case and the regenerate case (when the
 * teacher has supplied a reason and the prior round's grades are included).
 * On regenerate the teacher's note outranks the smallest-edit rule, and prior
 * solutions are shown as rejected so the model rewrites rather than repeats.
 *
 * The output JSON shape is enforced by the Zod schema passed to
 * `generateText({ output: Output.object({ schema }) })`, so this prompt just
 * supplies the content + the teacher's regenerate context if present.
 *
 * @param items - One entry per candidate free-text question.
 * @param opts - Optional regenerate context (teacher's reason + prior grades).
 * @returns A single user-prompt string for the LLM.
 */
export function buildGradingPrompt(
  items: AiGradeBatchInput[],
  opts?: AiGradeBatchOptions,
): string {
  const sections: string[] = [SYSTEM_RULES];

  const reason = opts?.reason?.trim() ?? "";
  if (reason.length > 0) {
    // The note is how this class is taught, so it outranks every generic rule below.
    sections.push(
      [
        "The teacher rejected the prior round and gave this note about how the class is taught:",
        reason,
        "This note overrides every other rule below. If it names a technique, idiom, or approach the students learn, each solution MUST use that technique wherever it applies, even when another approach is shorter.",
      ].join("\n"),
    );
  }

  const priorByQuestion = new Map<string, AiGradeBatchPriorGrade>();
  for (const pg of opts?.priorGrades ?? []) {
    priorByQuestion.set(pg.questionId, pg);
  }

  sections.push(
    "For each item that is NOT fully correct, also produce a `solution`: a corrected version of the student's answer with the SMALLEST possible edit. Preserve the student's variable names, structure, and style wherever possible — change only what is wrong. If the student's answer is blank, off-topic, or incoherent, synthesize a minimal idiomatic solution from scratch. When an item is fully correct and you score it 100, omit the `solution` field entirely for that item — do not return a solution (and never return an empty one).",
  );
  if (reason.length > 0) {
    sections.push(
      "The teacher's note above takes priority over the smallest-edit rule: keep the student's style, but switch to the technique the note names wherever it applies.",
    );
  }

  sections.push("Grade each of the following items:");
  for (const item of items) {
    const lines = [
      `--- questionId: ${item.questionId} ---`,
      `Question: ${item.questionContent}`,
      `Student answer: ${item.studentAnswer}`,
    ];
    const prior = priorByQuestion.get(item.questionId);
    if (prior) {
      lines.push(
        `Prior suggestion for this question: score=${prior.score}, feedback=${prior.feedback}`,
      );
      if (prior.solution && prior.solution.trim().length > 0) {
        lines.push(
          `Rejected prior solution (do not repeat it; rewrite it to follow the teacher's note):\n${prior.solution}`,
        );
      }
    }
    sections.push(lines.join("\n"));
  }

  sections.push(
    'Respond with JSON of the form { "grades": [{ "questionId": string, "score": int 0-100, "feedback": string, "solution"?: string }, ...] }. The "solution" field is optional: include it for any answer that is not fully correct, and omit it entirely when the score is 100. Return exactly one entry per questionId above.',
  );

  return sections.join("\n\n");
}
