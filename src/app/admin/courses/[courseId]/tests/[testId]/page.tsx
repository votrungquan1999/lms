import Link from "next/link";
import { Separator } from "src/components/ui/separator";
import { getPageGuard, getQuestionService } from "src/lib/services-singleton";
import { AddQuestionForm } from "./add-question-form";
import { ImportQuestionsForm } from "./import-questions-form";
import { QuestionList } from "./question-list";

export const metadata = {
  title: "Test Questions — LMS Admin",
  description: "Manage test questions",
};

export default async function TestDetailPage({
  params,
}: {
  params: Promise<{ courseId: string; testId: string }>;
}) {
  const { courseId, testId } = await params;

  const guard = await getPageGuard();
  await guard.requireAdminLogin();

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <header className="mb-8 w-full max-w-2xl">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href={`/admin/courses/${courseId}`} className="hover:underline">
            ← Course
          </Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">Test Questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Test ID: {testId}</p>
      </header>

      <section className="w-full max-w-2xl space-y-6">
        <AddQuestionForm testId={testId} courseId={courseId} />

        <ImportQuestionsForm testId={testId} courseId={courseId} />

        <Separator />

        <QuestionList questions={questions} />
      </section>
    </main>
  );
}
