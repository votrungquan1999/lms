"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useReducer,
} from "react";

interface GradedGroupState {
  open: boolean;
}

type GradedGroupAction = { type: "TOGGLE" };

interface GradedGroupContextValue {
  state: GradedGroupState;
  dispatch: React.Dispatch<GradedGroupAction>;
  panelId: string;
}

/**
 * Opens and closes the "Graded, not released" group.
 * @param state - Whether the rows are shown.
 * @param action - Flip the group.
 * @returns The next state.
 */
function gradedGroupReducer(
  state: GradedGroupState,
  action: GradedGroupAction,
): GradedGroupState {
  switch (action.type) {
    case "TOGGLE":
      return { open: !state.open };
  }
}

const GradedGroupContext = createContext<GradedGroupContextValue | null>(null);

/**
 * Holds the open state of one group. It starts closed on every visit and is not
 * stored, so the group stays open only while the page refreshes after a release.
 * @param children - The toggle and the panel.
 */
export function GradedGroupProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gradedGroupReducer, { open: false });
  const panelId = useId();
  return (
    <GradedGroupContext.Provider value={{ state, dispatch, panelId }}>
      {children}
    </GradedGroupContext.Provider>
  );
}

/**
 * The group's state and actions, for its toggle and its panel.
 * @returns Whether the rows are shown, the panel's id and a toggle action.
 */
export function useGradedGroup() {
  const context = useContext(GradedGroupContext);
  if (!context) {
    throw new Error("useGradedGroup must be used within GradedGroupProvider");
  }
  const { state, dispatch, panelId } = context;
  return {
    isOpen: state.open,
    panelId,
    toggle: () => dispatch({ type: "TOGGLE" }),
  };
}
