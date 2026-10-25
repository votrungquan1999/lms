/** Shown when a create form was opened under a different active school. */
export const ACTIVE_SCHOOL_CHANGED_MESSAGE = "Your active school changed";

/** Name of the hidden form field that carries the school a form was opened in. */
export const EXPECTED_SCHOOL_FIELD = "expectedSchoolId";

/**
 * Stale-tab check: a form opened before the active school changed must not
 * act in the newly active one. A missing value (old cached tab, crafted post)
 * is refused like a mismatch.
 * @param expected - The school the form was opened in, if it sent one.
 * @param actual - The session's active school.
 * @returns A refusal state to return from the action, or null when it may proceed.
 */
export function assertExpectedSchool(
  expected: FormDataEntryValue | string | null | undefined,
  actual: string,
): { success: false; message: string } | null {
  if (typeof expected === "string" && expected === actual) {
    return null;
  }
  return { success: false, message: ACTIVE_SCHOOL_CHANGED_MESSAGE };
}
