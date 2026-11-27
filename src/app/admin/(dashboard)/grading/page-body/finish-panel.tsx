import {
  groupReadyToReleaseByCourse,
  groupWaitingByCourse,
} from "src/app/admin/(dashboard)/grading/to-grade-groups";
import { getSchoolGradingCounts } from "src/lib/school-grading-counts";
import { FinishPanelView } from "./finish-panel.ui";
import { FinishRelease } from "./finish-release";
import type { GradingRouteKind } from "./grading-page-body.type";
import { gradingBasePath } from "./href";
import type { ReleaseStudentCounts } from "./release-dialog.ui";
import { type ReleaseStudent, ReleaseStudentStatus } from "./release-students";

interface FinishPanelProps {
  testTitle: string;
  /** The test page the panel links back to. */
  backHref: string;
  /** Every student of the course. */
  students: ReleaseStudent[];
  /** The answer just graded, as "<name>'s Q<n> saved <when>". */
  savedLine: string;
  testId: string;
  courseId: string;
  /** The page's school. */
  schoolId: string;
  /** The grading route the teacher is on; "Next in To grade" stays on it. */
  routeKind: GradingRouteKind;
  /** Students cannot see the correct answers yet. */
  offerCorrectAnswers: boolean;
  counts: ReleaseStudentCounts;
  choiceQuestionCount: number;
}

/** Names listed in full before the rest read "and n more". */
const NAMES_SHOWN = 3;

/**
 * Joins names for a sentence: "A", "A and B", "A, B and C", "A, B, C and 2 more".
 * @param names - The names to join; at least one.
 */
export function joinNames(names: string[]): string {
  if (names.length <= NAMES_SHOWN) {
    return names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, NAMES_SHOWN).join(", ")} and ${names.length - NAMES_SHOWN} more`;
}

/** Names the students and agrees the verb with how many there are. */
function who(names: string[], singular: string, plural: string): string {
  return `${joinNames(names)} ${names.length === 1 ? singular : plural}`;
}

/** What the teacher gets after the last answer is graded: who is graded, who can see it, and who is not in yet. */
export async function FinishPanel({
  testTitle,
  backHref,
  students,
  savedLine,
  testId,
  courseId,
  schoolId,
  routeKind,
  offerCorrectAnswers,
  counts,
  choiceQuestionCount,
}: FinishPanelProps) {
  const schoolCounts = await getSchoolGradingCounts(schoolId);
  const nextTest = groupWaitingByCourse(schoolCounts)
    .flatMap((group) => group.tests)
    .find((t) => t.testId !== testId);
  const readyToRelease = groupReadyToReleaseByCourse(schoolCounts)
    .flatMap((group) => group.tests)
    .filter((t) => t.testId !== testId);

  const named = (status: ReleaseStudentStatus) =>
    students.filter((s) => s.status === status);
  const hidden = named(ReleaseStudentStatus.Graded);
  const graded = students.filter(
    (s) =>
      s.status === ReleaseStudentStatus.Graded ||
      s.status === ReleaseStudentStatus.Released,
  );
  const stillWriting = named(ReleaseStudentStatus.StillWriting).map(
    (s) => s.name,
  );
  const notStarted = named(ReleaseStudentStatus.NotStarted).map((s) => s.name);

  const releaseLine =
    hidden.length > 0
      ? `Grades not released yet · ${joinNames(hidden.map((s) => s.name))} can't see ${hidden.length === 1 ? "her grade" : "their grades"} until you release ${hidden.length === 1 ? "it" : "them"}.`
      : "Grades released · every graded student can see her grade.";

  const notInLines = [
    stillWriting.length > 0 &&
      `${who(stillWriting, "is", "are")} still writing.`,
    notStarted.length > 0 && `${who(notStarted, "hasn't", "haven't")} started.`,
  ].filter((line): line is string => line !== false);

  return (
    <FinishPanelView
      testTitle={testTitle}
      savedLine={savedLine}
      gradedCount={graded.length}
      gradedStudents={graded.slice(0, NAMES_SHOWN).map((s) => ({
        name: s.name,
        username: s.username,
        released: s.status === ReleaseStudentStatus.Released,
      }))}
      moreGraded={Math.max(0, graded.length - NAMES_SHOWN)}
      releaseLine={releaseLine}
      notInLine={notInLines.join(" ")}
      backHref={backHref}
      nextHref={
        nextTest
          ? gradingBasePath({
              routeKind,
              courseId: nextTest.courseId,
              testId: nextTest.testId,
            })
          : "/admin/grading"
      }
      nextNote={
        nextTest
          ? null
          : readyToRelease.length === 0
            ? "Nothing else waiting"
            : `Nothing else waiting · Review ${readyToRelease.length === 1 ? readyToRelease[0].title : `${readyToRelease.length} tests`} not released`
      }
      release={
        <FinishRelease
          testId={testId}
          courseId={courseId}
          testTitle={testTitle}
          hiddenGradeCount={hidden.length}
          offerCorrectAnswers={offerCorrectAnswers}
          counts={counts}
          students={students}
          choiceQuestionCount={choiceQuestionCount}
        />
      }
    />
  );
}
