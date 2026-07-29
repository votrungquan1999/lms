import Link from "next/link";
import { notFound } from "next/navigation";
import { Separator } from "src/components/ui/separator";
import { attachQuestionMediaUrls } from "src/lib/question-media-urls";
import {
  getPoolQuestionService,
  getQuestionPoolService,
  getQuestionService,
  getTestService,
} from "src/lib/services-singleton";
import { AddQuestionForm } from "./add-question-form";
import { ComposeFromPoolsForm } from "./compose-from-pools-form";
import { DeleteTestButton } from "./delete-test-button";
import { ImportQuestionsForm } from "./import-questions-form";
import { QuestionList } from "./question-list";
import { TestSettingsPanel } from "./test-settings-panel";

export const metadata = {
  title: "Test Questions — LMS Admin",
  description: "Manage test questions",
};

// Presigned media URLs are short-lived, so render dynamically to mint fresh
// ones on each request (mirrors the student test-taking page).
export const dynamic = "force-dynamic";

export default async function TestDetailPage({
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
  const questions = await attachQuestionMediaUrls(
    await questionService.listQuestions(testId),
  );

  // Pools (with their current sizes) available to compose questions from.
  const poolService = await getQuestionPoolService();
  const poolQuestionService = await getPoolQuestionService();
  const allPools = await poolService.listPools();
  const composablePools = await Promise.all(
    allPools.map(async (pool) => ({
      id: pool.id,
      name: pool.name,
      questionCount: (await poolQuestionService.listPoolQuestions(pool.id))
        .length,
    })),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex w-full max-w-2xl items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{test.title}</h1>
          {test.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {test.description}
            </p>
          )}
        </div>
        <DeleteTestButton testId={testId} courseId={courseId} />
      </header>

      <section className="w-full max-w-2xl space-y-6">
        <TestSettingsPanel
          courseId={courseId}
          testId={testId}
          showGradeAfterSubmit={test.showGradeAfterSubmit}
          showCorrectAnswerAfterSubmit={test.showCorrectAnswerAfterSubmit}
          timeLimitMinutes={test.timeLimitMinutes}
          isPractice={test.isPractice}
          gradesReleasedAt={test.gradesReleasedAt}
          correctAnswersReleasedAt={test.correctAnswersReleasedAt}
        />

        <AddQuestionForm testId={testId} courseId={courseId} />

        <ImportQuestionsForm testId={testId} courseId={courseId} />

        <ComposeFromPoolsForm
          testId={testId}
          courseId={courseId}
          pools={composablePools}
        />

        <div>
          <Link
            href={`/admin/courses/${courseId}/tests/${testId}/grading`}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Grade Students →
          </Link>
        </div>

        <Separator />

        <QuestionList questions={questions} />
      </section>
    </div>
  );
}
