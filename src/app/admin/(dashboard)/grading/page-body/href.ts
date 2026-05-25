import { GradingMode, GradingSort } from "./grading-page-body.type";

interface GradingHrefInput {
  basePath: string;
  mode?: GradingMode;
  studentId?: string;
  questionId?: string;
  sort?: GradingSort;
}

/**
 * Builds a grading-page URL preserving any provided selection params and
 * dropping the ones that don't apply to the requested mode. Centralizes URL
 * construction per server-components-rules.md rule 3.
 */
export function gradingHref(input: GradingHrefInput): string {
  const params = new URLSearchParams();
  const mode = input.mode ?? GradingMode.Student;
  if (mode !== GradingMode.Student) params.set("mode", mode);

  if (mode === GradingMode.Student && input.studentId) {
    params.set("studentId", input.studentId);
  }
  if (mode === GradingMode.Question && input.questionId) {
    params.set("questionId", input.questionId);
  }
  if (input.sort && input.sort !== GradingSort.Enrollment) {
    params.set("sort", input.sort);
  }

  const qs = params.toString();
  return qs.length > 0 ? `${input.basePath}?${qs}` : input.basePath;
}
