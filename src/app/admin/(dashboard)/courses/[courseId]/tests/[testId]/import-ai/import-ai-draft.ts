import type { ParsedQuestion } from "src/lib/ai/ai-client";

/**
 * One parsed question in the review list, keyed by a stable client id.
 * `edited` tracks whether a teacher has hand-corrected this draft since
 * it last arrived from the AI, so a retry can warn before discarding it.
 * `retryError` surfaces a failed retry without blanking the pre-retry draft.
 * `importError` surfaces the import action's named rejection against the ONE
 * offending question, instead of a bare page-level banner.
 */
export interface ImportQuestionDraft extends ParsedQuestion {
  id: string;
  edited: boolean;
  retryError: string | null;
  importError: string | null;
  /** `importError` without its question prefix; Student view leads it with its own label. */
  importReason: string | null;
}

/** The fields a teacher can hand-edit in a draft's edit form. */
export type EditableFields = Pick<
  ImportQuestionDraft,
  "title" | "content" | "type" | "options" | "referenceAnswer" | "explanation"
>;

/**
 * Narrows a draft to the fields its edit form works on.
 * @param draft - Any draft, or a buffer holding more than the editable fields.
 * @returns Just the editable fields.
 */
export function editableFieldsOf(draft: EditableFields): EditableFields {
  return {
    title: draft.title,
    content: draft.content,
    type: draft.type,
    options: draft.options,
    referenceAnswer: draft.referenceAnswer,
    explanation: draft.explanation,
  };
}
