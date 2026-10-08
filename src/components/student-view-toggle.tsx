"use client";

import { Button } from "src/components/ui/button";

export type QuestionListView = "teacher" | "student";

/**
 * "Teacher view / Student view" switch above a question list. The teacher
 * list stays mounted (hidden) in Student view so an open edit survives a flip;
 * the student list only renders while it is selected.
 * @param view - Which view is showing.
 * @param onViewChange - Called when the teacher picks the other view.
 * @param teacherView - The list as the teacher edits it.
 * @param studentView - The list as a student sees it.
 */
export function StudentViewToggle({
  view,
  onViewChange,
  teacherView,
  studentView,
}: {
  view: QuestionListView;
  onViewChange: (view: QuestionListView) => void;
  teacherView: React.ReactNode;
  studentView: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={view === "teacher" ? "default" : "outline"}
          aria-pressed={view === "teacher"}
          onClick={() => onViewChange("teacher")}
        >
          Teacher view
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "student" ? "default" : "outline"}
          aria-pressed={view === "student"}
          onClick={() => onViewChange("student")}
        >
          Student view
        </Button>
      </div>
      <div hidden={view !== "teacher"} className="space-y-3">
        {teacherView}
      </div>
      {view === "student" && studentView}
    </div>
  );
}
