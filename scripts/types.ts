/**
 * Type definitions for test creation data files.
 *
 * Imports question input types from the main app's service layer
 * so data files get full type safety and autocomplete.
 */

import type {
  AddFreeTextQuestionInput,
  AddMultiSelectQuestionInput,
  AddSingleSelectQuestionInput,
} from "../src/lib/question-service";

// ── Question definition (service input types minus `createdBy`) ──────────────

type OmitCreatedBy<T> = Omit<T, "createdBy">;

export type QuestionDefinition =
  | OmitCreatedBy<AddFreeTextQuestionInput>
  | OmitCreatedBy<AddSingleSelectQuestionInput>
  | OmitCreatedBy<AddMultiSelectQuestionInput>;

// ── Test definition ─────────────────────────────────────────────────────────

export interface TestDefinition {
  /** ID of the existing course to create the test in. */
  courseId: string;

  /** Test metadata. */
  test: {
    title: string;
    description: string;
    showCorrectAnswerAfterSubmit?: boolean;
    showGradeAfterSubmit?: boolean;
  };

  /** Ordered list of questions to create in the test. */
  questions: QuestionDefinition[];
}
