"use client";

import { createContext, type ReactNode, useContext, useReducer } from "react";
import { matchesSearch } from "src/lib/search-text";
import type { TestRowData } from "./test-rows";

export enum TestsChip {
  All = "all",
  NeedsGrading = "needs-grading",
  NotReleased = "not-released",
  Practice = "practice",
}

interface TestsListState {
  query: string;
  chip: TestsChip;
}

type TestsListAction =
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_CHIP"; chip: TestsChip };

/** Applies the search box and chip choices; each changes only its own field. */
function testsListReducer(
  state: TestsListState,
  action: TestsListAction,
): TestsListState {
  switch (action.type) {
    case "SET_QUERY":
      return { ...state, query: action.query };
    case "SET_CHIP":
      return { ...state, chip: action.chip };
    default:
      return state;
  }
}

/** Whether a row belongs to a chip's group. */
function inChip(row: TestRowData, chip: TestsChip): boolean {
  switch (chip) {
    case TestsChip.NeedsGrading:
      return row.waiting;
    case TestsChip.NotReleased:
      return row.notReleased;
    case TestsChip.Practice:
      return row.isPractice;
    default:
      return true;
  }
}

interface TestsListContextValue {
  state: TestsListState;
  rows: TestRowData[];
  dispatch: (action: TestsListAction) => void;
}

const TestsListContext = createContext<TestsListContextValue | null>(null);

/**
 * Holds the course's test rows with the teacher's search text and chip.
 * @param rows - Every test of the course, newest first.
 */
export function TestsListProvider({
  rows,
  children,
}: {
  rows: TestRowData[];
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(testsListReducer, {
    query: "",
    chip: TestsChip.All,
  });
  return (
    <TestsListContext.Provider value={{ state, rows, dispatch }}>
      {children}
    </TestsListContext.Provider>
  );
}

function useTestsListContext(): TestsListContextValue {
  const value = useContext(TestsListContext);
  if (!value) {
    throw new Error("useTestsList must be used within TestsListProvider");
  }
  return value;
}

/** The rows the search and chip leave, the chips' whole-course counts, and the current choices. */
export function useTestsList() {
  const { state, rows } = useTestsListContext();
  const counts: Record<TestsChip, number> = {
    [TestsChip.All]: rows.length,
    [TestsChip.NeedsGrading]: rows.filter((r) =>
      inChip(r, TestsChip.NeedsGrading),
    ).length,
    [TestsChip.NotReleased]: rows.filter((r) =>
      inChip(r, TestsChip.NotReleased),
    ).length,
    [TestsChip.Practice]: rows.filter((r) => inChip(r, TestsChip.Practice))
      .length,
  };
  return {
    query: state.query,
    chip: state.chip,
    total: rows.length,
    counts,
    visible: rows.filter(
      (r) => inChip(r, state.chip) && matchesSearch(r.title, state.query),
    ),
  };
}

/** What the search box and chips do. */
export function useTestsListActions() {
  const { dispatch } = useTestsListContext();
  return {
    setQuery: (query: string) => dispatch({ type: "SET_QUERY", query }),
    setChip: (chip: TestsChip) => dispatch({ type: "SET_CHIP", chip }),
  };
}
