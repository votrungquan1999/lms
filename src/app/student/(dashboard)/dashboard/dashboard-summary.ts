import { TestStatus } from "src/lib/test-status-service";

export interface TestStatusSummary {
  toDo: number;
  awaitingGrade: number;
  graded: number;
}

/**
 * Aggregates a flat list of test statuses into headline counts for the student
 * dashboard summary.
 * @param statuses - Test statuses across the student's courses/tests.
 * @returns Counts of to-do (not started or in progress), awaiting grade
 *   (submitted), and graded tests.
 */
export function summarizeTestStatuses(
  statuses: TestStatus[],
): TestStatusSummary {
  const summary: TestStatusSummary = { toDo: 0, awaitingGrade: 0, graded: 0 };

  for (const status of statuses) {
    if (status === TestStatus.NotStarted || status === TestStatus.InProgress) {
      summary.toDo += 1;
    } else if (status === TestStatus.Submitted) {
      summary.awaitingGrade += 1;
    } else if (status === TestStatus.Graded) {
      summary.graded += 1;
    }
  }

  return summary;
}
