/**
 * Shared types for the two-pane grading shell. Selection state lives in the
 * URL — this file holds enums for the URL values and the lightweight cell
 * models the roster + detail render from.
 */

import type { TestStatus } from "src/lib/test-status-service";

/** Which of the two grading routes a link stays on. */
export enum GradingRouteKind {
  /** `/admin/grading/<testId>` */
  Hub = "hub",
  /** `/admin/courses/<courseId>/tests/<testId>/grading` */
  Course = "course",
}

export enum GradingSort {
  Enrollment = "enrollment",
  Status = "status",
  Name = "name",
}

export interface RosterStudentCellModel {
  id: string;
  name: string;
  username: string;
  status: TestStatus;
  /** Number of the student's submitted answers that already have a grade row. */
  gradedCount: number;
  /** Number of questions the student submitted an answer for. */
  answeredCount: number;
  /** Number of the test's questions the student left entirely blank. */
  blankCount: number;
}
