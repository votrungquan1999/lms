"use client";

import { useState, useTransition } from "react";
import { requestRedoAction } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";

interface RequestRedoDialogProps {
  testId: string;
  courseId: string;
  testTitle: string;
  student: { id: string; name: string; username: string };
  /** When she handed in; null when not known. */
  submittedAt: Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirms a redo request: nothing is written until the teacher presses Request redo. */
export function RequestRedoDialog({
  testId,
  courseId,
  testTitle,
  student,
  submittedAt,
  open,
  onOpenChange,
}: RequestRedoDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function requestRedo() {
    const form = new FormData();
    form.set("testId", testId);
    form.set("courseId", courseId);
    form.set("studentId", student.id);
    setError(null);
    startTransition(async () => {
      const result = await requestRedoAction(null, form);
      if (result.success) changeOpen(false);
      else setError(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Ask {student.name} to redo {testTitle}?
          </DialogTitle>
          <DialogDescription>
            {student.name} @{student.username}
            {submittedAt &&
              ` · submitted ${submittedAt.toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-medium">{student.name} sees:</span> Redo
            Required · Your teacher has requested that you redo this test.
          </p>
          <p>
            <span className="font-medium">What happens:</span> {student.name}{" "}
            answers the test again and submits. Grades stay. Answers changed
            come back to To grade.
          </p>
          <p className="text-muted-foreground">
            Until then {student.name} shows Redo requested here.
          </p>
          {error && <p className="text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={requestRedo}>
            {pending ? "Requesting…" : "Request redo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
