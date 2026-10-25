/**
 * Refusal copy for adding an existing student to a school.
 * Kept out of the `"use server"` action module, which may only export async functions.
 */

/** Shown when no student on the platform has the given username. */
export const UNKNOWN_STUDENT_MESSAGE = "No student with that username";

/** Shown when the student already belongs to the admin's school. */
export const ALREADY_IN_SCHOOL_MESSAGE =
  "That student is already in this school";
