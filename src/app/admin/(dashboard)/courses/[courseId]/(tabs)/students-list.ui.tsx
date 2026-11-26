"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { setEnrollmentsAction } from "../actions";
import {
  type StudentRowData,
  useStudentsList,
  useStudentsListActions,
} from "./students-list.state";

/** One enrolled student with Remove behind a confirm. */
function StudentRow({
  courseId,
  student,
}: {
  courseId: string;
  student: StudentRowData;
}) {
  const [state, formAction, isPending] = useActionState(
    setEnrollmentsAction,
    null,
  );
  return (
    <li className="grid gap-1 border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 wrap-anywhere">
          <p className="text-[15px] font-semibold">{student.name}</p>
          <p className="text-[13px] text-muted-foreground">
            @{student.username}
          </p>
        </div>
        <p className="shrink-0 text-sm">{student.joined}</p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Remove ${student.name} from this course`}
              className="text-destructive"
            >
              Remove
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="wrap-anywhere">
                Remove {student.name} from this course?
              </AlertDialogTitle>
              <AlertDialogDescription>
                They lose access to this course's tests. Their account stays on
                the Students page.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={formAction}>
              <input type="hidden" name="courseId" value={courseId} />
              <input
                type="hidden"
                name="observedStudentIds"
                value={student.id}
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={isPending}
                  >
                    Remove
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {state && !state.success && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </li>
  );
}

/**
 * The enrolled students with a search box; the search matches the name or the @username.
 * @param courseId - The course the students are enrolled in.
 */
export function StudentsList({ courseId }: { courseId: string }) {
  const { query, total, visible } = useStudentsList();
  const { setQuery } = useStudentsListActions();

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative block w-full md:w-72">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search students"
          placeholder="Search students"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 pl-8"
        />
      </div>
      {visible.length > 0 ? (
        <ul className="rounded-xl border bg-card">
          {visible.map((student) => (
            <StudentRow
              key={student.id}
              courseId={courseId}
              student={student}
            />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No students match
        </p>
      )}
    </div>
  );
}
