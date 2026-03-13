"use client";

import { useActionState, useState } from "react";
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
import { type EnrollStudentsState, enrollStudentsAction } from "./actions";

interface StudentItem {
  id: string;
  username: string;
  name: string;
}

/**
 * Client component: dialog for enrolling students in a course.
 * Shows all students with checkboxes for selection.
 */
export function EnrollStudentDialog({
  courseId,
  students,
}: {
  courseId: string;
  students: StudentItem[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    EnrollStudentsState | null,
    FormData
  >(enrollStudentsAction, null);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Enroll Students
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enroll Students</DialogTitle>
          <DialogDescription>
            Select students to enroll in this course.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="courseId" value={courseId} />
          {selected.size > 0 &&
            Array.from(selected).map((id) => (
              <input key={id} type="hidden" name="studentIds" value={id} />
            ))}

          {students.length > 0 ? (
            <div className="space-y-3">
              {students.map((student) => (
                <label
                  key={student.id}
                  htmlFor={`enroll-${student.id}`}
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50 cursor-pointer"
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
            <p className="text-sm text-muted-foreground text-center py-4">
              No students found. Create student accounts first.
            </p>
          )}

          <Button
            type="submit"
            disabled={isPending || selected.size === 0}
            className="w-full"
          >
            {isPending
              ? "Enrolling…"
              : `Enroll ${selected.size} Student${selected.size !== 1 ? "s" : ""}`}
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
