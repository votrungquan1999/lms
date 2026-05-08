import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Separator } from "src/components/ui/separator";
import {
  getAnswerService,
  getEnrollmentService,
  getGradeService,
  getQuestionService,
  getRedoRequestService,
  getStudentService,
  getTestFeedbackService,
  getTestStatusService,
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";
import {
  FreeTextQuestionGradeForm,
  McQuestionGradeForm,
  OverallFeedbackForm,
  RequestRedoButton,
} from "../courses/[courseId]/tests/[testId]/grading/grading-forms";
import { StudentStatusBadge } from "./student-status-badge";

const STATUS_SORT_RANK: Record<TestStatus, number> = {
  [TestStatus.Submitted]: 0,
  [TestStatus.InProgress]: 1,
  [TestStatus.NotStarted]: 2,
  [TestStatus.Graded]: 3,
};

interface GradingPageBodyProps {
  test: Test;
  courseId: string;
}

/**
 * Renders the per-student grading cards for a single test.
 * Shared by:
 *   - /admin/courses/[courseId]/tests/[testId]/grading (course-scoped)
 *   - /admin/grading/[testId] (variant via grading hub)
 *
 * Sorts students Submitted → InProgress → NotStarted → Graded with
 * the data-fetch order (enrolledAt desc) as stable tiebreaker.
 */
export async function GradingPageBody({
  test,
  courseId,
}: GradingPageBodyProps) {
  const testId = test.id;

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const enrollmentService = await getEnrollmentService();
  const studentIds = await enrollmentService.listEnrollmentsByCourse(courseId);

  const studentService = await getStudentService();
  const students = await studentService.findByIds(studentIds);

  const answerService = await getAnswerService();
  const gradeService = await getGradeService();
  const testStatusService = await getTestStatusService();

  const studentDataUnsorted = await Promise.all(
    students.map(async (student, enrollmentIndex) => {
      const latestAnswers = await answerService.getLatestAnswers(
        testId,
        student.id,
      );
      const rawAnswerMap = new Map(
        latestAnswers.map((a) => [a.questionId, a.answer]),
      );

      const grades = await gradeService.getGrades(testId, student.id);
      const gradeMap = new Map(grades.map((g) => [g.questionId, g]));

      const testFeedbackService = await getTestFeedbackService();
      const testFeedback = await testFeedbackService.getTestFeedback(
        testId,
        student.id,
      );

      const redoRequestService = await getRedoRequestService();
      const activeRedoRequest = await redoRequestService.getActiveRedoRequest(
        testId,
        student.id,
      );

      const status = await testStatusService.getStatus(
        testId,
        student.id,
        questions.length,
      );

      return {
        student,
        rawAnswerMap,
        gradeMap,
        testFeedback,
        hasAnswers: latestAnswers.length > 0,
        hasActiveRedoRequest: activeRedoRequest !== null,
        status,
        enrollmentIndex,
      };
    }),
  );

  const studentData = [...studentDataUnsorted].sort((a, b) => {
    const rankDiff = STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
    if (rankDiff !== 0) return rankDiff;
    return a.enrollmentIndex - b.enrollmentIndex;
  });

  return (
    <section className="w-full max-w-3xl space-y-8">
      {studentData.length === 0 && (
        <p className="text-center text-muted-foreground">
          No students enrolled in this course yet.
        </p>
      )}

      {studentData.map(
        (
          {
            student,
            rawAnswerMap,
            gradeMap,
            testFeedback,
            hasAnswers,
            hasActiveRedoRequest,
            status,
          },
          idx,
        ) => {
          const gradedCount = gradeMap.size;
          const totalQ = questions.length;
          const allGraded = gradedCount >= totalQ;
          const badgeClassName = allGraded
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : gradedCount > 0
              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

          return (
            <div
              key={student.id}
              data-testid={`student-card-${student.id}`}
              data-student-name={student.name}
            >
              {idx > 0 && <Separator className="mb-8" />}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">
                      {student.name}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        @{student.username}
                      </span>
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      <StudentStatusBadge status={status} />
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClassName}`}
                      >
                        {gradedCount}/{totalQ} graded
                      </span>
                      <RequestRedoButton
                        testId={testId}
                        courseId={courseId}
                        studentId={student.id}
                        hasActiveRedoRequest={hasActiveRedoRequest}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {questions.map((question) => {
                    const grade = gradeMap.get(question.id);
                    const rawAnswer = rawAnswerMap.get(question.id);
                    const sharedProps = {
                      testId,
                      courseId,
                      questionId: question.id,
                      studentId: student.id,
                      questionTitle: question.title,
                      questionOrder: question.order,
                      existingScore: grade?.score ?? null,
                      existingFeedback: grade?.feedback ?? null,
                      existingSolution: grade?.solution ?? null,
                      studentStatus: status,
                    };

                    if (
                      question.type === "single_select" ||
                      question.type === "multi_select"
                    ) {
                      return (
                        <McQuestionGradeForm
                          key={question.id}
                          {...sharedProps}
                          selectedIds={
                            rawAnswer?.type === "mc"
                              ? rawAnswer.selectedIds
                              : []
                          }
                          options={question.options}
                        />
                      );
                    }

                    return (
                      <FreeTextQuestionGradeForm
                        key={question.id}
                        {...sharedProps}
                        answerText={
                          rawAnswer?.type === "free_text"
                            ? rawAnswer.text
                            : null
                        }
                      />
                    );
                  })}

                  {hasAnswers && (
                    <OverallFeedbackForm
                      testId={testId}
                      courseId={courseId}
                      studentId={student.id}
                      existingFeedback={testFeedback}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          );
        },
      )}
    </section>
  );
}
