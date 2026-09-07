/**
 * The three tabs an admin can switch the join-request queue between.
 * A real enum (repo rule) — never copy `grading/page.tsx`'s `FilterValue`
 * string union, which is a live violation of that rule.
 */
export enum JoinRequestFilter {
  Waiting = "waiting",
  Approved = "approved",
  Rejected = "rejected",
}

/**
 * One queue row, joined from a join request plus the student and course it
 * names. Never rendered unless both resolved (D55) — every visible row stays
 * actionable.
 */
export interface JoinRequestRow {
  id: string;
  studentName: string;
  studentUsername: string;
  courseTitle: string;
  requestedAt: Date;
}
