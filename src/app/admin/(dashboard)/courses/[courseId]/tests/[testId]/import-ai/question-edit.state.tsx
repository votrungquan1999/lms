"use client";

import { createContext, useContext, useReducer } from "react";
import type { ImportQuestionDraft } from "./import-ai-form.state";

/** The editable fields of a review-list draft, seeded fresh per edit session. */
export type QuestionEditDraft = Omit<ImportQuestionDraft, "id">;

type QuestionEditAction =
  | { type: "SET_TITLE"; title: string }
  | { type: "SET_CONTENT"; content: string }
  | { type: "SET_REFERENCE_ANSWER"; referenceAnswer: string }
  | { type: "SET_EXPLANATION"; explanation: string }
  | { type: "SET_OPTION_TEXT"; index: number; text: string }
  | { type: "TOGGLE_OPTION_CORRECT"; index: number };

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
    default:
      return state;
  }
}

interface QuestionEditContextValue {
  state: QuestionEditDraft;
  dispatch: React.Dispatch<QuestionEditAction>;
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
  initial: QuestionEditDraft;
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(questionEditReducer, initial);
  return (
    <QuestionEditContext.Provider value={{ state, dispatch }}>
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
  toggleOptionCorrect: (index: number) => void;
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
    toggleOptionCorrect: (index) =>
      dispatch({ type: "TOGGLE_OPTION_CORRECT", index }),
  };
}
