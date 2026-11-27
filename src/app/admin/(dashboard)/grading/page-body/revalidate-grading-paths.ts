import { revalidatePath } from "next/cache";
import { GradingRouteKind } from "./grading-page-body.type";
import { gradingBasePath } from "./href";

/**
 * Refreshes every admin page that shows a test's grading after a write: both
 * grading routes and the To grade list.
 * @param courseId - The test's course.
 * @param testId - The test.
 * @param extraPaths - Other pages this write changes (the test page, the student's page).
 */
export function revalidateGradingPaths(
  courseId: string,
  testId: string,
  extraPaths: string[] = [],
): void {
  revalidatePath(
    gradingBasePath({ routeKind: GradingRouteKind.Course, courseId, testId }),
  );
  revalidatePath(
    gradingBasePath({ routeKind: GradingRouteKind.Hub, courseId, testId }),
  );
  revalidatePath("/admin/grading");
  for (const path of extraPaths) revalidatePath(path);
}
