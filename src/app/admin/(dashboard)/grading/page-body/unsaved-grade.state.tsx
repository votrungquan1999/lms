"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLeaveGuard } from "src/app/admin/(dashboard)/leave-guard.state";

type ReportDraft = (source: string, hasDraft: boolean) => void;

const UnsavedGradeContext = createContext<ReportDraft>(() => {});

const LEAVE_TITLE = "Discard your unsaved grade?";
const LEAVE_MESSAGE =
  "What you typed in the grade panel is not saved. Leaving now discards it.";

/**
 * Collects which forms in the grade panel hold typed work that differs from
 * what is saved, and tells the admin leave guard while any of them does.
 */
export function UnsavedGradeProvider({ children }: { children: ReactNode }) {
  const { setHasWork } = useLeaveGuard();
  const [drafts, setDrafts] = useState<ReadonlySet<string>>(new Set());

  const report = useCallback<ReportDraft>((source, hasDraft) => {
    setDrafts((previous) => {
      if (previous.has(source) === hasDraft) return previous;
      const next = new Set(previous);
      if (hasDraft) next.add(source);
      else next.delete(source);
      return next;
    });
  }, []);

  const hasDraft = drafts.size > 0;
  useEffect(() => {
    setHasWork(hasDraft, LEAVE_MESSAGE, LEAVE_TITLE);
    return () => setHasWork(false);
  }, [hasDraft, setHasWork]);

  return (
    <UnsavedGradeContext.Provider value={report}>
      {children}
    </UnsavedGradeContext.Provider>
  );
}

/**
 * Reports whether a form holds a typed draft. A form that unmounts (a new
 * answer or student remounts it) stops counting as unsaved work.
 * @param source - Names the form, so two forms in the panel do not hide each other.
 */
export function useReportUnsavedGrade(source: string, hasDraft: boolean) {
  const report = useContext(UnsavedGradeContext);
  useEffect(() => {
    report(source, hasDraft);
    return () => report(source, false);
  }, [report, source, hasDraft]);
}
