import { notFound } from "next/navigation";
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
  getTestService,
} from "src/lib/services-singleton";
import { FreeTextQuestionGradeForm, McQuestionGradeForm, OverallFeedbackForm, ReleaseGradesButton, RequestRedoButton } from "./grading-forms";


export const metadata = {
  title: "Grade Test — LMS Admin",
  description: "Grade student submissions",
};

export default async function GradingPage({
  params,
}: {
  params: Promise<{ courseId: string; testId: string }>;
}) {
  const { courseId, testId } = await params;

  const testService = await getTestService();
  const test = await testService.getTest(testId);
  if (!test || test.courseId !== courseId) {
    notFound();
  }

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const enrollmentService = await getEnrollmentService();
  const studentIds = await enrollmentService.listEnrollmentsByCourse(courseId);

  const studentService = await getStudentService();
  const students = await studentService.findByIds(studentIds);

  const answerService = await getAnswerService();
  const gradeService = await getGradeService();

  // Build data for each student
  const studentData = await Promise.all(
    students.map(async (student) => {
      const latestAnswers = await answerService.getLatestAnswers(
        testId,
        student.id,
      );
      // Map questionId → the raw StudentAnswer object
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

      return {
        student,
        rawAnswerMap,
        gradeMap,
        testFeedback,
        hasAnswers: latestAnswers.length > 0,
        hasActiveRedoRequest: activeRedoRequest !== null,
      };
    }),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Grade: {test.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {students.length} student(s) enrolled · {questions.length} question(s)
        </p>
        {!test.showGradeAfterSubmit && !test.gradesReleasedAt && (
          <div className="mt-4">
            <ReleaseGradesButton testId={testId} courseId={courseId} />
          </div>
        )}
      </header>

      <section className="w-full max-w-3xl space-y-8">
        {studentData.length === 0 && (
          <p className="text-center text-muted-foreground">
            No students enrolled in this course yet.
          </p>
        )}

        {studentData.map(
          (
            { student, rawAnswerMap, gradeMap, testFeedback, hasAnswers, hasActiveRedoRequest },
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
              <div key={student.id}>
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
    </div>
  );
}
