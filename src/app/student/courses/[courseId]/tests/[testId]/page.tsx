import Link from "next/link";
import { notFound } from "next/navigation";
import { Separator } from "src/components/ui/separator";
import {
  getAnswerService,
  getPageGuard,
  getQuestionService,
  getTestService,
} from "src/lib/services-singleton";
import { AnswerForm } from "./answer-form";

export const metadata = {
  title: "Test — LMS",
  description: "Answer test questions",
};

export default async function StudentTestDetailPage({
  params,
}: {
  params: Promise<{ courseId: string; testId: string }>;
}) {
  const { courseId, testId } = await params;

  const guard = await getPageGuard();
  const session = await guard.requireStudentLogin();
  await guard.requireEnrollment(courseId, session.studentId);

  const testService = await getTestService();
  const test = await testService.getTest(testId);
  if (!test || test.courseId !== courseId) {
    notFound();
  }

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const answerService = await getAnswerService();
  const latestAnswers = await answerService.getLatestAnswers(
    testId,
    session.studentId,
  );

  const answerMap = new Map(
    latestAnswers.map((a) => [a.questionId, a.answer]),
  );

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-2xl">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link
            href={`/student/courses/${courseId}`}
            className="hover:underline"
          >
            ← Back to Course
          </Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">{test.title}</h1>
        {test.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {test.description}
          </p>
        )}
      </header>

      <section className="w-full max-w-2xl space-y-8">
        {questions.length > 0 ? (
          questions.map((question, index) => (
            <div key={question.id} className="space-y-4">
              {index > 0 && <Separator />}
              <div>
                <h2 className="text-lg font-semibold">
                  Question {question.order}: {question.title}
                </h2>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {question.content}
                </div>
              </div>
              <AnswerForm
                testId={testId}
                courseId={courseId}
                questionId={question.id}
                existingAnswer={answerMap.get(question.id) ?? ""}
              />
            </div>
          ))
        ) : (
          <p className="text-center text-muted-foreground">
            No questions have been added to this test yet.
          </p>
        )}
      </section>
    </main>
  );
}
