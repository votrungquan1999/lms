"use client";

import { createContext, type ReactNode, useContext, useReducer } from "react";
import { matchesSearch } from "src/lib/search-text";

export interface StudentRowData {
  id: string;
  name: string;
  username: string;
  /** Joined date, already formatted on the server in Vietnam time. */
  joined: string;
}

interface StudentsListState {
  query: string;
}

interface SetQueryAction {
  type: "SET_QUERY";
  query: string;
}

/** Applies the search box text. */
function studentsListReducer(
  state: StudentsListState,
  action: SetQueryAction,
): StudentsListState {
  switch (action.type) {
    case "SET_QUERY":
      return { ...state, query: action.query };
    default:
      return state;
  }
}

interface StudentsListContextValue {
  state: StudentsListState;
  rows: StudentRowData[];
  dispatch: (action: SetQueryAction) => void;
}

const StudentsListContext = createContext<StudentsListContextValue | null>(
  null,
);

/**
 * Holds the course's enrolled students with the teacher's search text.
 * @param rows - Every enrolled student, in display order.
 */
export function StudentsListProvider({
  rows,
  children,
}: {
  rows: StudentRowData[];
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(studentsListReducer, { query: "" });
  return (
    <StudentsListContext.Provider value={{ state, rows, dispatch }}>
      {children}
    </StudentsListContext.Provider>
  );
}

function useStudentsListContext(): StudentsListContextValue {
  const value = useContext(StudentsListContext);
  if (!value) {
    throw new Error("useStudentsList must be used within StudentsListProvider");
  }
  return value;
}

/** The rows the search leaves, the whole-course total and the search text. */
export function useStudentsList() {
  const { state, rows } = useStudentsListContext();
  return {
    query: state.query,
    total: rows.length,
    visible: rows.filter(
      (r) =>
        matchesSearch(r.name, state.query) ||
        matchesSearch(`@${r.username}`, state.query),
    ),
  };
}

/** What the search box does. */
export function useStudentsListActions() {
  const { dispatch } = useStudentsListContext();
  return {
    setQuery: (query: string) => dispatch({ type: "SET_QUERY", query }),
  };
}
