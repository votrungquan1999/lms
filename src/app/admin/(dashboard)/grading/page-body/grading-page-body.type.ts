/**
 * Shared types for the two-pane grading shell. Selection state lives in the
 * URL — this file holds the enums for the URL values.
 */

/** Which of the two grading routes a link stays on. */
export enum GradingRouteKind {
  /** `/admin/grading/<testId>` */
  Hub = "hub",
  /** `/admin/courses/<courseId>/tests/<testId>/grading` */
  Course = "course",
}
