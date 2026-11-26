/**
 * Link to a course's page.
 * @param courseId - The course.
 */
export function courseHref(courseId: string): string {
  return `/admin/courses/${courseId}`;
}

/**
 * Link to a test's page inside its course.
 * @param courseId - The test's course.
 * @param testId - The test.
 */
export function courseTestHref(courseId: string, testId: string): string {
  return `/admin/courses/${courseId}/tests/${testId}`;
}
