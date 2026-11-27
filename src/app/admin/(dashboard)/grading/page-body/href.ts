import { GradingMode, GradingSort } from "./grading-page-body.type";

interface GradingHrefInput {
  basePath: string;
  mode?: GradingMode;
  studentId?: string;
  questionId?: string;
  sort?: GradingSort;
  /** Keep only the answers that need a grade in the question row. */
  needsOnly?: boolean;
}

/**
 * Builds a grading-page URL carrying every provided selection param, so the
 * student and the question both survive a switch of mode. Centralizes URL
 * construction per server-components-rules.md rule 3.
 */
export function gradingHref(input: GradingHrefInput): string {
  const params = new URLSearchParams();
  const mode = input.mode ?? GradingMode.Student;
  if (mode !== GradingMode.Student) params.set("mode", mode);

  if (input.studentId) params.set("studentId", input.studentId);
  if (input.questionId) params.set("questionId", input.questionId);
  if (input.sort && input.sort !== GradingSort.Enrollment) {
    params.set("sort", input.sort);
  }
  if (input.needsOnly) params.set("needsOnly", "1");

  const qs = params.toString();
  return qs.length > 0 ? `${input.basePath}?${qs}` : input.basePath;
}
