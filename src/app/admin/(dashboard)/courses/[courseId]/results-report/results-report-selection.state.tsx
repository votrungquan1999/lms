"use client";

import { createContext, useContext, useReducer } from "react";
import type { Student } from "src/lib/student-service";
import type { Test } from "src/lib/test-service";

/**
 * Selection state for the results-report export view: which single student and
 * which set of tests the admin has picked, plus the source lists.
 */
interface SelectionContextValue {
  courseId: string;
  students: Student[];
  tests: Test[];
  selectedStudentId: string | null;
  selectedTestIds: string[];
  selectStudent: (studentId: string) => void;
  toggleTest: (testId: string) => void;
}

interface SelectionState {
  selectedStudentId: string | null;
  selectedTestIds: string[];
}

type SelectionAction =
  | { type: "SELECT_STUDENT"; studentId: string }
  | { type: "TOGGLE_TEST"; testId: string };

/**
 * Reduces selection actions: picks the single student, toggles a test in/out
 * of the selected set (preserving the tests' source order).
 */
function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "SELECT_STUDENT":
      return { ...state, selectedStudentId: action.studentId };
    case "TOGGLE_TEST": {
      const isSelected = state.selectedTestIds.includes(action.testId);
      return {
        ...state,
        selectedTestIds: isSelected
          ? state.selectedTestIds.filter((id) => id !== action.testId)
          : [...state.selectedTestIds, action.testId],
      };
    }
    default:
      return state;
  }
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * Provides results-report selection state to the export view.
 */
export function ResultsReportSelectionProvider({
  courseId,
  students,
  tests,
  children,
}: {
  courseId: string;
  students: Student[];
  tests: Test[];
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(selectionReducer, {
    selectedStudentId: null,
    selectedTestIds: [],
  });

  const value: SelectionContextValue = {
    courseId,
    students,
    tests,
    selectedStudentId: state.selectedStudentId,
    selectedTestIds: state.selectedTestIds,
    selectStudent: (studentId) =>
      dispatch({ type: "SELECT_STUDENT", studentId }),
    toggleTest: (testId) => dispatch({ type: "TOGGLE_TEST", testId }),
  };

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/**
 * Reads the results-report selection state. Throws outside the provider.
 */
export function useResultsReportSelection(): SelectionContextValue {
  const value = useContext(SelectionContext);
  if (!value) {
    throw new Error(
      "useResultsReportSelection must be used within ResultsReportSelectionProvider",
    );
  }
  return value;
}
