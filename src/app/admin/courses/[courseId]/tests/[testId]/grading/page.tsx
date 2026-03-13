import Link from "next/link";
import { notFound } from "next/navigation";
import { Separator } from "src/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  getAnswerService,
  getEnrollmentService,
  getGradeService,
  getPageGuard,
  getQuestionService,
  getStudentService,
  getTestFeedbackService,
  getTestService,
} from "src/lib/services-singleton";
import { QuestionGradeForm, OverallFeedbackForm } from "./grading-forms";

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

  const guard = await getPageGuard();
  await guard.requireAdminLogin();

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
      const answerMap = new Map(
        latestAnswers.map((a) => [a.questionId, a.answer]),
      );

      const grades = await gradeService.getGrades(testId, student.id);
      const gradeMap = new Map(grades.map((g) => [g.questionId, g]));

      const testFeedbackService = await getTestFeedbackService();
      const testFeedback = await testFeedbackService.getTestFeedback(
        testId,
        student.id,
      );

      return { student, answerMap, gradeMap, testFeedback, hasAnswers: latestAnswers.length > 0 };
    }),
  );

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-3xl">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link
            href={`/admin/courses/${courseId}/tests/${testId}`}
            className="hover:underline"
          >
            ← Test Questions
          </Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">
          Grade: {test.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {students.length} student(s) enrolled · {questions.length} question(s)
        </p>
      </header>

      <section className="w-full max-w-3xl space-y-8">
        {studentData.length === 0 && (
          <p className="text-center text-muted-foreground">
            No students enrolled in this course yet.
          </p>
        )}

        {studentData.map(
          ({ student, answerMap, gradeMap, testFeedback, hasAnswers }, idx) => (
            <div key={student.id}>
              {idx > 0 && <Separator className="mb-8" />}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">
                    {student.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      @{student.username}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {questions.map((question) => {
                    const grade = gradeMap.get(question.id);
                    return (
                      <QuestionGradeForm
                        key={question.id}
                        testId={testId}
                        courseId={courseId}
                        questionId={question.id}
                        studentId={student.id}
                        questionTitle={question.title}
                        questionOrder={question.order}
                        studentAnswer={answerMap.get(question.id) ?? null}
                        existingScore={grade?.score ?? null}
                        existingFeedback={grade?.feedback ?? null}
                        existingSolution={grade?.solution ?? null}
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
          ),
        )}
      </section>
    </main>
  );
}
