"use client";

import { createContext, useContext, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import type { StudentPickerRow } from "./student-picker-rows";

interface StillWritingConfirmProps {
  /** The still-writing student being asked about, or null while the dialog is closed. */
  student: StudentPickerRow | null;
  testTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}

interface StillWritingValue {
  /** Whether the teacher already chose "Grade anyway" for this student on this page. */
  isConfirmed: (studentId: string) => boolean;
  confirm: (studentId: string) => void;
}

// Outside the grading screen's provider nothing is locked.
const StillWritingContext = createContext<StillWritingValue>({
  isConfirmed: () => true,
  confirm: () => {},
});

const GradeLockContext = createContext(false);

/** Whether the grading controls under a StillWritingGate are locked; read-only toggles ignore it. */
export function useGradeLocked() {
  return useContext(GradeLockContext);
}

/** Remembers which still-writing students the teacher chose to grade; a reload starts over. */
export function StillWritingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const confirm = (studentId: string) =>
    setConfirmed((previous) => new Set(previous).add(studentId));
  return (
    <StillWritingContext.Provider
      value={{ isConfirmed: (id) => confirmed.has(id), confirm }}
    >
      {children}
    </StillWritingContext.Provider>
  );
}

/**
 * Reads which still-writing students the teacher has confirmed grading on this screen.
 * @returns The confirmation state shared by the picker, the boxes and the grade panel.
 */
export function useStillWriting() {
  return useContext(StillWritingContext);
}

/** Shows a still-writing student's grade panel locked until the teacher presses Grade anyway. */
export function StillWritingGate({
  studentId,
  studentName,
  testTitle,
  stillWriting,
  children,
}: {
  studentId: string;
  studentName: string;
  testTitle: string;
  stillWriting: boolean;
  children: React.ReactNode;
}) {
  const { isConfirmed, confirm } = useStillWriting();
  if (!stillWriting || isConfirmed(studentId)) return <>{children}</>;
  return (
    <>
      <div className="shrink-0 space-y-2 rounded-md bg-muted p-3 text-sm">
        <p>
          {studentName} hasn&apos;t submitted {testTitle}. Grading is locked
          until you choose Grade anyway.
        </p>
        <Button type="button" size="sm" onClick={() => confirm(studentId)}>
          Grade anyway
        </Button>
      </div>
      <GradeLockContext.Provider value={true}>
        {children}
      </GradeLockContext.Provider>
    </>
  );
}

/** Asks before the teacher opens a student who has not handed in the test. */
export function StillWritingConfirm({
  student,
  testTitle,
  onCancel,
  onConfirm,
}: StillWritingConfirmProps) {
  return (
    <AlertDialog
      open={student !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {student?.name} is still writing. Grade anyway?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {student?.name} hasn't submitted {testTitle}. You'll see the{" "}
            {student?.savedAnswers} of {student?.questionCount} answers saved so
            far.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Grade anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
