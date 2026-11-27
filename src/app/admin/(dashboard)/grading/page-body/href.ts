import { GradingMode } from "src/lib/grading-mode";
import { GradingRouteKind, GradingSort } from "./grading-page-body.type";

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

/**
 * The grading route a link stays on, built from ids the server has verified.
 * @param input - The route kind and the test's ids.
 * @returns The route's path, with no query string.
 */
export function gradingBasePath(input: {
  routeKind: GradingRouteKind;
  courseId: string;
  testId: string;
}): string {
  return input.routeKind === GradingRouteKind.Course
    ? `/admin/courses/${input.courseId}/tests/${input.testId}/grading`
    : `/admin/grading/${input.testId}`;
}

/**
 * Which grading route a base path is. The page passes its own server-built
 * path, so a path under the course route is the course route and any other
 * is the hub.
 * @param basePath - The route's path, with no query string.
 * @returns The route kind.
 */
export function gradingRouteKind(basePath: string): GradingRouteKind {
  return basePath.startsWith("/admin/courses/")
    ? GradingRouteKind.Course
    : GradingRouteKind.Hub;
}
