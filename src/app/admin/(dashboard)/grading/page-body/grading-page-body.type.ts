/**
 * Shared types for the grading shell. Selection state lives in the
 * URL — this file holds the enums for the URL values.
 */

/** Which of the two grading routes a link stays on. */
export enum GradingRouteKind {
  /** `/admin/grading/<testId>` */
  Hub = "hub",
  /** `/admin/courses/<courseId>/tests/<testId>/grading` */
  Course = "course",
}

/** Who a release reaches: every student, or the ticked ones. */
export enum ReleaseMode {
  Whole = "whole",
  Chosen = "chosen",
}
