"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "src/components/ui/dialog";
import { type SetEnrollmentsState, setEnrollmentsAction } from "./actions";

interface StudentItem {
  id: string;
  username: string;
  name: string;
}

/**
 * Client component: manage enrollments dialog.
 * Pre-ticks currently enrolled students. Unticking = unenroll on submit.
 * Uses idempotent setEnrollmentsAction (PUT semantics).
 */
export function ManageEnrollmentsDialog({
  courseId,
  students,
  enrolledStudentIds,
}: {
  courseId: string;
  students: StudentItem[];
  enrolledStudentIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(enrolledStudentIds),
  );
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    SetEnrollmentsState | null,
    FormData
  >(setEnrollmentsAction, null);

  function toggleStudent(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    // Reset selection to enrolled state when reopening
    if (nextOpen) {
      setSelected(new Set(enrolledStudentIds));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Manage Enrollments</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Enrollments</DialogTitle>
          <DialogDescription>
            Tick students to enroll. Untick to unenroll.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(() => {
              return formAction(new FormData(e.currentTarget));
            });
          }}
          className="space-y-4"
        >
          <input type="hidden" name="courseId" value={courseId} />
          {Array.from(selected).map((id) => (
            <input key={id} type="hidden" name="studentIds" value={id} />
          ))}

          {students.length > 0 ? (
            <div className="space-y-3">
              {students.map((student) => (
                <label
                  key={student.id}
                  htmlFor={`enroll-${student.id}`}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    id={`enroll-${student.id}`}
                    checked={selected.has(student.id)}
                    onCheckedChange={() => toggleStudent(student.id)}
                  />
                  <div>
                    <p className="text-sm font-medium">{student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      @{student.username}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No students found. Create student accounts first.
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Updating…" : "Confirm Enrollments"}
          </Button>
        </form>

        {state?.success && (
          <output className="block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {state.message}
          </output>
        )}

        {state && !state.success && (
          <div
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {state.message}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
