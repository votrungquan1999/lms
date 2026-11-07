"use client";

import { createContext, type ReactNode, useContext, useReducer } from "react";

interface FoldState {
  open: boolean;
}

type FoldAction = { type: "TOGGLE" } | { type: "CLOSE" };

interface FoldContextValue {
  state: FoldState;
  dispatch: React.Dispatch<FoldAction>;
}

/**
 * Opens and closes the phone-size fold of the navigator's question boxes.
 * `createReducerContext` is not in this project, so this is the
 * Context + `useReducer` fallback other state files here use.
 * @param state - Whether the boxes are shown.
 * @param action - Flip the fold, or close it.
 * @returns The next fold state.
 */
function foldReducer(state: FoldState, action: FoldAction): FoldState {
  switch (action.type) {
    case "TOGGLE":
      return { open: !state.open };
    case "CLOSE":
      return { open: false };
  }
}

const FoldContext = createContext<FoldContextValue | null>(null);

/**
 * Holds the fold state for one navigator bar; starts folded.
 * @param children - The bar.
 */
export function NavigatorFoldProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(foldReducer, { open: false });
  return (
    <FoldContext.Provider value={{ state, dispatch }}>
      {children}
    </FoldContext.Provider>
  );
}

/**
 * The fold's state and actions, for the toggle button and the box panel.
 * @returns Whether the boxes are shown, plus toggle and close actions.
 */
export function useNavigatorFold() {
  const context = useContext(FoldContext);
  if (!context) {
    throw new Error(
      "useNavigatorFold must be used within NavigatorFoldProvider",
    );
  }
  const { state, dispatch } = context;
  return {
    isOpen: state.open,
    toggle: () => dispatch({ type: "TOGGLE" }),
    close: () => dispatch({ type: "CLOSE" }),
  };
}
