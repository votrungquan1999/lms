"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import type { EditableFields } from "./import-ai-draft";
import type { ReviewPicture } from "./import-ai-form.state";

/** The editable fields of a review-list draft plus the files picked in this edit session, seeded fresh per session. */
export interface QuestionEditDraft extends EditableFields {
  /** Pictures picked in the modal; they join the review pictures only on Save. */
  addedPictures: ReviewPicture[];
}

/** Fewest choices a multiple-choice question keeps while its choices are edited. */
export const MIN_CHOICES = 2;

type QuestionEditAction =
  | { type: "SET_TITLE"; title: string }
  | { type: "SET_CONTENT"; content: string }
  | { type: "SET_REFERENCE_ANSWER"; referenceAnswer: string }
  | { type: "SET_EXPLANATION"; explanation: string }
  | { type: "SET_OPTION_TEXT"; index: number; text: string }
  | { type: "ADD_OPTION" }
  | { type: "REMOVE_OPTION"; index: number }
  | { type: "TOGGLE_OPTION_CORRECT"; index: number }
  | { type: "REMOVE_PICTURE"; number: number }
  | { type: "ADD_PICTURE"; picture: ReviewPicture };

/**
 * Reduces the in-progress edit buffer for one question. `createReducerContext`
 * is not available in this project (confirmed precedent:
 * `compose-from-pools-form.tsx`), so this follows `question-media-picker.state.tsx`'s
 * Context + `useReducer` fallback.
 */
function questionEditReducer(
  state: QuestionEditDraft,
  action: QuestionEditAction,
): QuestionEditDraft {
  switch (action.type) {
    case "SET_TITLE":
      return { ...state, title: action.title };
    case "SET_CONTENT":
      return { ...state, content: action.content };
    case "SET_REFERENCE_ANSWER":
      return { ...state, referenceAnswer: action.referenceAnswer };
    case "SET_EXPLANATION":
      return { ...state, explanation: action.explanation };
    case "SET_OPTION_TEXT":
      return {
        ...state,
        options: state.options?.map((option, i) =>
          i === action.index ? { ...option, text: action.text } : option,
        ),
      };
    case "ADD_OPTION":
      return {
        ...state,
        options: [...(state.options ?? []), { text: "", isCorrect: false }],
      };
    case "REMOVE_OPTION":
      if ((state.options?.length ?? 0) <= MIN_CHOICES) return state;
      return {
        ...state,
        options: state.options?.filter((_, i) => i !== action.index),
      };
    case "TOGGLE_OPTION_CORRECT":
      // single_select: picking one clears every other option (radio semantics).
      return {
        ...state,
        options: state.options?.map((option, i) =>
          state.type === "single_select"
            ? { ...option, isCorrect: i === action.index }
            : i === action.index
              ? { ...option, isCorrect: !option.isCorrect }
              : option,
        ),
      };
    case "REMOVE_PICTURE":
      return {
        ...state,
        imageNumbers: state.imageNumbers.filter((n) => n !== action.number),
        addedPictures: state.addedPictures.filter(
          (picture) => picture.number !== action.number,
        ),
      };
    case "ADD_PICTURE":
      return {
        ...state,
        imageNumbers: [...state.imageNumbers, action.picture.number],
        addedPictures: [...state.addedPictures, action.picture],
      };
    default:
      return state;
  }
}

interface QuestionEditContextValue {
  state: QuestionEditDraft;
  dispatch: React.Dispatch<QuestionEditAction>;
  /** Keeps the picked files' previews alive past this modal; call when Save hands them on. */
  keepPreviews: () => void;
}

const QuestionEditContext = createContext<QuestionEditContextValue | null>(
  null,
);

/**
 * Provides one question's in-progress edit buffer, seeded from its current
 * draft value. A fresh instance is mounted per edit session.
 */
export function QuestionEditProvider({
  initial,
  children,
}: {
  initial: EditableFields;
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(questionEditReducer, {
    ...initial,
    addedPictures: [],
  });
  const kept = useRef(false);
  const latestAdded = useRef<ReviewPicture[]>([]);
  useEffect(() => {
    latestAdded.current = state.addedPictures;
  }, [state.addedPictures]);
  // Previews of files that never reached a Save would leak browser memory.
  useEffect(
    () => () => {
      if (kept.current) return;
      for (const picture of latestAdded.current) {
        URL.revokeObjectURL(picture.previewUrl);
      }
    },
    [],
  );
  return (
    <QuestionEditContext.Provider
      value={{
        state,
        dispatch,
        keepPreviews: () => {
          kept.current = true;
        },
      }}
    >
      {children}
    </QuestionEditContext.Provider>
  );
}

function useQuestionEditContext(): QuestionEditContextValue {
  const value = useContext(QuestionEditContext);
  if (!value) {
    throw new Error(
      "useQuestionEditContext must be used within QuestionEditProvider",
    );
  }
  return value;
}

/** Domain hook for handing picked previews on to Save. */
export function useKeepPreviews(): () => void {
  return useQuestionEditContext().keepPreviews;
}

/** Domain hook exposing the current edit buffer. Throws outside the provider. */
export function useQuestionEditState(): QuestionEditDraft {
  return useQuestionEditContext().state;
}

/** Domain hook exposing the edit buffer's field-change actions. */
export function useQuestionEditActions(): {
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setReferenceAnswer: (referenceAnswer: string) => void;
  setExplanation: (explanation: string) => void;
  setOptionText: (index: number, text: string) => void;
  addOption: () => void;
  removeOption: (index: number) => void;
  toggleOptionCorrect: (index: number) => void;
  removePicture: (number: number) => void;
  addPicture: (picture: ReviewPicture) => void;
} {
  const { dispatch } = useQuestionEditContext();
  return {
    setTitle: (title) => dispatch({ type: "SET_TITLE", title }),
    setContent: (content) => dispatch({ type: "SET_CONTENT", content }),
    setReferenceAnswer: (referenceAnswer) =>
      dispatch({ type: "SET_REFERENCE_ANSWER", referenceAnswer }),
    setExplanation: (explanation) =>
      dispatch({ type: "SET_EXPLANATION", explanation }),
    setOptionText: (index, text) =>
      dispatch({ type: "SET_OPTION_TEXT", index, text }),
    addOption: () => dispatch({ type: "ADD_OPTION" }),
    removeOption: (index) => dispatch({ type: "REMOVE_OPTION", index }),
    toggleOptionCorrect: (index) =>
      dispatch({ type: "TOGGLE_OPTION_CORRECT", index }),
    removePicture: (number) => dispatch({ type: "REMOVE_PICTURE", number }),
    addPicture: (picture) => dispatch({ type: "ADD_PICTURE", picture }),
  };
}
