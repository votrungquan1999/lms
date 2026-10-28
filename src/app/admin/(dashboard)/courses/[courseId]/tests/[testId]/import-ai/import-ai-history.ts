import type { ParsedQuestion } from "src/lib/ai/ai-client";
import type { EditableFields, ImportQuestionDraft } from "./import-ai-draft";

/**
 * What a Retry-with-AI answer replaces; a field the AI left out is an explicit `undefined`.
 * Pictures are not in it: the teacher places them by hand, and a retry keeps them.
 */
export type RetryPatch = Pick<
  ParsedQuestion,
  "title" | "content" | "type" | "options" | "referenceAnswer" | "explanation"
>;

/** One thing the teacher (or a retry) did to a draft since the read. */
export type Change =
  | { kind: "edit"; id: string; fields: EditableFields }
  | { kind: "removePicture"; id: string; number: number }
  | { kind: "addPicture"; id: string; number: number }
  | { kind: "retry"; id: string; patch: RetryPatch }
  | { kind: "delete"; id: string }
  | { kind: "movePicture"; id: string; toId: string; number: number };

/**
 * Applies one change to its draft.
 * @param draft - The draft before the change.
 * @param change - The change, which targets this draft and keeps it in the list.
 * @returns The draft after the change.
 */
function applyChange(
  draft: ImportQuestionDraft,
  change: Exclude<Change, { kind: "delete" | "movePicture" }>,
): ImportQuestionDraft {
  switch (change.kind) {
    case "edit":
      return { ...draft, ...change.fields, edited: true };
    case "removePicture":
      return {
        ...draft,
        imageNumbers: (draft.imageNumbers ?? []).filter(
          (n) => n !== change.number,
        ),
      };
    case "addPicture":
      return {
        ...draft,
        imageNumbers: [...(draft.imageNumbers ?? []), change.number],
      };
    case "retry":
      // Spread so a field the AI left out clears the stale value.
      return { ...draft, ...change.patch, edited: false };
  }
}

/**
 * Compares two drafts' editable fields by value.
 * @param a - One draft's editable fields.
 * @param b - The other's.
 * @returns Whether every field is equal.
 */
export function sameFields(a: EditableFields, b: EditableFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Replays the changes over the drafts the read produced.
 * @param base - The drafts as the read returned them.
 * @param changes - The changes still in effect, oldest first.
 * @returns The drafts as the teacher sees them.
 */
export function replay(
  base: ImportQuestionDraft[],
  changes: Change[],
): ImportQuestionDraft[] {
  return changes.reduce((drafts, change) => {
    switch (change.kind) {
      case "delete":
        return drafts.filter((draft) => draft.id !== change.id);
      case "movePicture":
        return drafts.map((draft) => {
          if (draft.id === change.id) {
            return {
              ...draft,
              imageNumbers: (draft.imageNumbers ?? []).filter(
                (n) => n !== change.number,
              ),
            };
          }
          if (draft.id !== change.toId) return draft;
          const held = draft.imageNumbers ?? [];
          // A target that already holds the picture keeps it once.
          return held.includes(change.number)
            ? draft
            : { ...draft, imageNumbers: [...held, change.number] };
        });
      default:
        return drafts.map((draft) =>
          draft.id === change.id ? applyChange(draft, change) : draft,
        );
    }
  }, base);
}

/**
 * Words an Undo or Redo button so it names the change and the question it touches.
 * @param verb - "Undo" or "Redo".
 * @param change - The change the button would act on, if any.
 * @param drafts - The drafts just before the change applies, so a deleted question still has its position.
 * @param firstQuestionNumber - Number the first draft will have once saved.
 * @returns The bare verb when there is nothing to act on.
 */
export function historyLabel(
  verb: "Undo" | "Redo",
  change: Change | null,
  drafts: ImportQuestionDraft[],
  firstQuestionNumber: number,
): string {
  if (!change) return verb;
  const position = drafts.findIndex((draft) => draft.id === change.id);
  const question = `Question ${firstQuestionNumber + position}`;
  switch (change.kind) {
    case "edit":
      return `${verb} edit of ${question}`;
    case "removePicture":
      return `${verb} removing picture ${change.number} from ${question}`;
    case "addPicture":
      return `${verb} adding picture ${change.number} to ${question}`;
    case "retry":
      return `${verb} AI retry of ${question}`;
    case "delete":
      return `${verb} delete of ${question}`;
    case "movePicture": {
      const toPosition = drafts.findIndex((draft) => draft.id === change.toId);
      return `${verb} move of picture ${change.number} from ${question} to Question ${firstQuestionNumber + toPosition}`;
    }
  }
}
