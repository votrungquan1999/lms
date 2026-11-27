import type { PairGradingResult } from "src/lib/grading-count-service";
import { TestStatus } from "src/lib/test-status-service";

/** Where a student stands for a release, which decides whether she can be ticked. */
export enum ReleaseStudentStatus {
  Graded = "graded",
  Released = "released",
  Waiting = "waiting",
  StillWriting = "still-writing",
  RedoRequested = "redo-requested",
  NotStarted = "not-started",
}

/** One student of the test, as the release dialog's checklist lists her. */
export interface ReleaseStudent {
  id: string;
  name: string;
  username: string;
  status: ReleaseStudentStatus;
}

/**
 * The release status of one student's pair; an open redo hides every other status.
 * @param pair - The student's grading result, absent for a student with none.
 */
export function releaseStatusOfPair(
  pair: PairGradingResult | undefined,
): ReleaseStudentStatus {
  if (pair?.redoRequested) return ReleaseStudentStatus.RedoRequested;
  switch (pair?.status) {
    case TestStatus.Graded:
      return pair.gradedHidden
        ? ReleaseStudentStatus.Graded
        : ReleaseStudentStatus.Released;
    case TestStatus.Submitted:
      return ReleaseStudentStatus.Waiting;
    case TestStatus.InProgress:
      return ReleaseStudentStatus.StillWriting;
    default:
      return ReleaseStudentStatus.NotStarted;
  }
}
