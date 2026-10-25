import { EXPECTED_SCHOOL_FIELD } from "src/lib/expected-school";

/**
 * Hidden field carrying the school a form was opened in, so the
 * action can refuse a post made after the active school changed.
 * @param schoolId - The active school when the form rendered.
 */
export function ExpectedSchoolField({ schoolId }: { schoolId: string }) {
  return <input type="hidden" name={EXPECTED_SCHOOL_FIELD} value={schoolId} />;
}
