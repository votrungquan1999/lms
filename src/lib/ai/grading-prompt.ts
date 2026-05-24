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

  if (opts?.reason && opts.reason.trim().length > 0) {
    sections.push(
      `The teacher rejected the prior round and asked you to regenerate with this reason: ${opts.reason.trim()}`,
    );
  }

  const priorByQuestion = new Map<string, AiGradeBatchPriorGrade>();
  for (const pg of opts?.priorGrades ?? []) {
    priorByQuestion.set(pg.questionId, pg);
  }

  sections.push(
    "For each item, also produce a `solution`: a corrected version of the student's answer with the SMALLEST possible edit. Preserve the student's variable names, structure, and style wherever possible — change only what is wrong. If the student's answer is blank, off-topic, or incoherent, synthesize a minimal idiomatic solution from scratch. Never return an empty solution.",
  );

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
        lines.push(`Prior suggested solution:\n${prior.solution}`);
      }
    }
    sections.push(lines.join("\n"));
  }

  sections.push(
    'Respond with JSON of the form { "grades": [{ "questionId": string, "score": int 0-100, "feedback": string, "solution": string }, ...] }. Return exactly one entry per questionId above.',
  );

  return sections.join("\n\n");
}
