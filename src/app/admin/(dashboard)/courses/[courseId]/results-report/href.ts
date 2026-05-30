/**
 * Builds the download URL for a student's results-report PDF. Encodes the
 * selected tests as repeated `testId` query params so the download route can
 * read them order-preserving via `searchParams.getAll("testId")`.
 * @param courseId - The course the report belongs to.
 * @param studentId - The selected student.
 * @param testIds - The selected test IDs, in display order.
 */
export function buildResultsReportDownloadHref(
  courseId: string,
  studentId: string,
  testIds: string[],
): string {
  const params = new URLSearchParams();
  params.set("studentId", studentId);
  for (const testId of testIds) {
    params.append("testId", testId);
  }
  return `/admin/courses/${courseId}/results-report/download?${params.toString()}`;
}
