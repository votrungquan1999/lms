import { notFound } from "next/navigation";
import {
  getAnswerService,
  getQuestionService,
  getTestService,
} from "src/lib/services-singleton";
import { ImportAiProvider } from "./import-ai-form.state";
import { ImportAiFilePicker, QuestionPreviewList } from "./question-preview.ui";

export const metadata = {
  title: "Import Questions with AI — LMS Admin",
  description: "Upload a document and let AI draft questions for review",
};

export default async function ImportAiPage({
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

  // D49: what REPLACE (Step 34) would remove and its worst-case blast
  // radius — the same shared batch call as Step 25's edit modal.
  const questionService = await getQuestionService();
  const existingQuestions = await questionService.listQuestions(testId);
  const answerService = await getAnswerService();
  const answeredCounts = await answerService.countAnsweredStudentsByQuestionIds(
    existingQuestions.map((q) => q.id),
  );
  // A true lower bound on distinct students affected, not a fabricated
  // exact total: the per-question counts can't be summed without risking
  // double-counting a student who answered more than one question.
  const answeredStudentCount = Math.max(0, ...answeredCounts.values());

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          Import Questions with AI
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a .docx or .pdf of {test.title}&rsquo;s questions. AI drafts
          each question here for you to review before anything is added to the
          test.
        </p>
      </header>

      <ImportAiProvider>
        <section className="w-full max-w-2xl space-y-6">
          <ImportAiFilePicker />
          <QuestionPreviewList
            testId={testId}
            courseId={courseId}
            existingQuestionCount={existingQuestions.length}
            answeredStudentCount={answeredStudentCount}
          />
        </section>
      </ImportAiProvider>
    </div>
  );
}
