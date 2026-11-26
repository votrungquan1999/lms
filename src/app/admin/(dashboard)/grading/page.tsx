import Link from "next/link";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { pluralize } from "src/lib/pluralize";
import { questionTypeSummary } from "src/lib/question-type-words";
import { relativeDay } from "src/lib/relative-time";
import {
  getGradingCountService,
  getPageGuard,
} from "src/lib/services-singleton";
import { ReleaseGradesButton } from "../courses/[courseId]/tests/[testId]/grading/grading-forms";
import { GradedGroupProvider } from "./graded-group.state";
import { courseHref, courseTestHref } from "./href";
import { GradingMode } from "./page-body/grading-page-body.type";
import { gradingHref } from "./page-body/href";
import {
  GradedGroupPanel,
  GradedGroupToggle,
  ToGradeColumn,
  ToGradeGroup,
  ToGradeGroupHeader,
  ToGradeHeader,
  ToGradeNote,
  ToGradeRow,
  ToGradeRowActions,
  ToGradeRowDetails,
  ToGradeRowLine,
  ToGradeRowMeta,
  ToGradeRowTitle,
  ToGradeRowTitleLink,
  ToGradeSection,
  ToGradeSectionHeader,
  ToGradeSectionHeading,
  ToGradeSummary,
} from "./to-grade.ui";
import {
  groupReadyToReleaseByCourse,
  groupWaitingByCourse,
} from "./to-grade-groups";

export const metadata = {
  title: "To grade — LMS Admin",
  description: "Tests with work waiting for a grade",
};

/**
 * To grade — the teacher's home: tests with submissions waiting, grouped by
 * course, the course with the oldest waiting hand-in first.
 */
export default async function ToGradePage() {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();

  const countService = await getGradingCountService(session.school.id);
  const counts = await countService.getCounts();
  const now = new Date();
  const groups = groupWaitingByCourse(counts);
  const testsWaiting = groups.reduce((sum, g) => sum + g.tests.length, 0);
  const releaseGroups = groupReadyToReleaseByCourse(counts);
  const testsToRelease = counts.testsReadyToRelease;
  // A test with a hand-in still waiting is not "ready to release", yet its graded students may not see their grades
  const someGradeHidden = counts.tests.some(
    (t) => !t.isPractice && t.gradedHidden > 0,
  );

  return (
    <ToGradeColumn>
      <ToGradeHeader>
        <h1 className="text-3xl font-bold tracking-tight">To grade</h1>
        <ToGradeSummary>
          {counts.waiting > 0
            ? `${counts.waiting} ${pluralize(counts.waiting, "submission")} waiting`
            : "Nothing waiting"}
          {testsToRelease > 0 &&
            ` · ${testsToRelease} ${pluralize(testsToRelease, "test")} graded but not released`}
        </ToGradeSummary>
      </ToGradeHeader>

      {groups.length > 0 && (
        <ToGradeSection>
          <ToGradeSectionHeading>
            Needs grading{" "}
            <span className="font-medium text-muted-foreground">
              ({testsWaiting})
            </span>
          </ToGradeSectionHeading>
          {groups.map(({ course, tests }) => (
            <ToGradeGroup key={course.courseId}>
              <ToGradeGroupHeader>
                <Link
                  href={courseHref(course.courseId)}
                  className="font-semibold text-foreground"
                >
                  {course.title}
                </Link>
                <span>
                  {` · ${course.waiting} waiting · ${tests.length} ${pluralize(tests.length, "test")}`}
                </span>
              </ToGradeGroupHeader>
              {tests.map((test) => (
                <ToGradeRow key={test.testId} testId={test.testId}>
                  <ToGradeRowDetails>
                    <ToGradeRowTitle>
                      <ToGradeRowTitleLink
                        href={courseTestHref(test.courseId, test.testId)}
                      >
                        {test.title}
                      </ToGradeRowTitleLink>
                      <Badge variant="warning">{test.waiting} waiting</Badge>
                    </ToGradeRowTitle>
                    <ToGradeRowLine>
                      {test.oldestWaitingStudentName} submitted{" "}
                      {test.oldestWaitingAt
                        ? relativeDay(test.oldestWaitingAt, now)
                        : ""}
                      {" · "}
                      <b className="font-semibold">
                        {test.answersLeft}{" "}
                        {pluralize(test.answersLeft, "answer")} left
                      </b>{" "}
                      to grade
                      {` · ${test.fullyGraded} of ${test.submitted} submitted students fully graded`}
                    </ToGradeRowLine>
                    <ToGradeRowMeta>
                      {questionTypeSummary(test.questionCount, test.typeCounts)}
                    </ToGradeRowMeta>
                  </ToGradeRowDetails>
                  <ToGradeRowActions>
                    <Button variant="outline" asChild>
                      <Link
                        href={gradingHref({
                          basePath: `/admin/grading/${test.testId}`,
                          mode: GradingMode.Question,
                        })}
                      >
                        By question
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link
                        href={gradingHref({
                          basePath: `/admin/grading/${test.testId}`,
                        })}
                      >
                        Continue grading
                      </Link>
                    </Button>
                  </ToGradeRowActions>
                </ToGradeRow>
              ))}
            </ToGradeGroup>
          ))}
        </ToGradeSection>
      )}
      <ToGradeSection>
        <GradedGroupProvider>
          <ToGradeSectionHeader>
            {testsToRelease > 0 ? (
              <GradedGroupToggle>
                Graded, not released ({testsToRelease})
              </GradedGroupToggle>
            ) : (
              <ToGradeSectionHeading>
                Graded, not released (0)
              </ToGradeSectionHeading>
            )}
            <ToGradeNote>
              {testsToRelease > 0
                ? "Students can't see these grades until you release them."
                : someGradeHidden
                  ? "Nothing to release yet."
                  : "Students can see every grade you have given."}
            </ToGradeNote>
          </ToGradeSectionHeader>
          {testsToRelease === 0 && (
            <ToGradeNote>Nothing to release.</ToGradeNote>
          )}
          {testsToRelease > 0 && (
            <GradedGroupPanel>
              {releaseGroups.map(({ course, tests }) => (
                <ToGradeGroup key={course.courseId}>
                  <ToGradeGroupHeader>
                    <Link
                      href={courseHref(course.courseId)}
                      className="font-semibold text-foreground"
                    >
                      {course.title}
                    </Link>
                    <span>
                      {` · ${course.students} ${pluralize(course.students, "student")}`}
                    </span>
                  </ToGradeGroupHeader>
                  {tests.map((test) => (
                    <ToGradeRow key={test.testId} testId={test.testId}>
                      <ToGradeRowDetails>
                        <ToGradeRowTitle>
                          <ToGradeRowTitleLink
                            href={courseTestHref(test.courseId, test.testId)}
                          >
                            {test.title}
                          </ToGradeRowTitleLink>
                          <Badge variant="success">
                            {test.fullyGraded} graded
                          </Badge>
                          <Badge variant="secondary">
                            {test.releasedTo === 0
                              ? "Not released"
                              : `Released to ${test.releasedTo} of ${test.fullyGraded}`}
                          </Badge>
                        </ToGradeRowTitle>
                        <ToGradeRowMeta>
                          {`${questionTypeSummary(test.questionCount, test.typeCounts)} · all ${test.submitted} ${pluralize(test.submitted, "submission")} graded`}
                        </ToGradeRowMeta>
                      </ToGradeRowDetails>
                      <ToGradeRowActions>
                        <ReleaseGradesButton
                          testId={test.testId}
                          courseId={test.courseId}
                          label="Release"
                          variant="default"
                        />
                      </ToGradeRowActions>
                    </ToGradeRow>
                  ))}
                </ToGradeGroup>
              ))}
            </GradedGroupPanel>
          )}
        </GradedGroupProvider>
      </ToGradeSection>
    </ToGradeColumn>
  );
}
