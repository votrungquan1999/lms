"use client";

import { useState } from "react";
import type { StudentCardQuestion } from "src/components/student-question-card.ui";
import { StudentViewList } from "src/components/student-view-list.ui";
import {
  type QuestionListView,
  StudentViewToggle,
} from "src/components/student-view-toggle";

/**
 * The test page's question list with a Teacher view / Student view switch.
 * @param teacherView - The list as the teacher edits it (a server-rendered slot).
 * @param studentQuestions - The saved questions as students see them, answer key left out.
 */
export function TestQuestionsView({
  teacherView,
  studentQuestions,
}: {
  teacherView: React.ReactNode;
  studentQuestions: StudentCardQuestion[];
}) {
  const [view, setView] = useState<QuestionListView>("teacher");

  return (
    <StudentViewToggle
      view={view}
      onViewChange={setView}
      teacherView={teacherView}
      studentView={<StudentViewList questions={studentQuestions} />}
    />
  );
}
