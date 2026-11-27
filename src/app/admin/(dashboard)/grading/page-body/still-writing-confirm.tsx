"use client";

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
import type { StudentPickerRow } from "./student-picker-rows";

interface StillWritingConfirmProps {
  /** The still-writing student being asked about, or null while the dialog is closed. */
  student: StudentPickerRow | null;
  testTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
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
