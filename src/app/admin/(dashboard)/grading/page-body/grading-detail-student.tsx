import { AiSuggestionPanel } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-suggestion-panel";
import { AutoGradeWithAiButton } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/auto-grade-with-ai-button";
import {
  CompactGradeForm,
  FreeTextQuestionGradeForm,
  McQuestionGradeForm,
  OverallFeedbackForm,
  RequestRedoButton,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { ReleaseGradeForStudentControl } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/release-grade-for-student";
import { AnnotationTool } from "src/app/admin/(dashboard)/grading/page-body/annotation-tool";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import type { AiGradeSuggestion } from "src/lib/ai-grade-types";
import type { AnnotationEntry } from "src/lib/annotation-service";
import {
  type AnswerImage,
  attachAnswerImageUrls,
} from "src/lib/answer-image-urls";
import { isMcQuestion } from "src/lib/question-service";
import {
  getAiGradeService,
  getAnnotationService,
  getAnswerService,
  getGradeService,
  getQuestionService,
  getRedoRequestService,
  getTestFeedbackService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";
import { StudentStatusBadge } from "../student-status-badge";

interface GradingDetailStudentProps {
  test: Test;
  courseId: string;
  student: { id: string; name: string; username: string };
  /** Base path the page is rendered at (no query string). */
  basePath: string;
  /** Current `?sort=` value, preserved in the Save & Next redirect target. */
  sort?: string;
}

/**
 * Renders the full grading surface for one student: per-question forms,
 * AI suggestion panels, overall feedback form, plus per-student controls
 * (request redo, release grades, auto-grade with AI). Ported from the
 * legacy `grading-page-body.tsx`. Lives in the right pane of the new shell.
 */
export async function GradingDetailStudent({
  test,
  courseId,
  student,
  basePath,
  sort,
}: GradingDetailStudentProps) {
  const testId = test.id;

  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(testId);

  const answerService = await getAnswerService();
  const latestAnswers = await answerService.getLatestAnswers(
    testId,
    student.id,
  );
  const rawAnswerMap = new Map(
    latestAnswers.map((a) => [a.questionId, a.answer]),
  );
  const latestAnswerIdByQuestion = new Map(
    latestAnswers.map((a) => [a.questionId, a.id]),
  );

  const gradeService = await getGradeService();
  const grades = await gradeService.getGrades(testId, student.id);
  const gradeMap = new Map(grades.map((g) => [g.questionId, g]));

  // Pre-load photo URLs + annotations for image answers (the map callback
  // below is synchronous). Annotations live in their own collection, separate
  // from the grade.
  const annotationService = await getAnnotationService();
  const answerImagesMap = new Map<string, AnswerImage[]>();
  const annotationsMap = new Map<string, AnnotationEntry[]>();
  for (const [questionId, ans] of rawAnswerMap) {
    if (ans.type === "image") {
      answerImagesMap.set(
        questionId,
        await attachAnswerImageUrls(ans.mediaKeys),
      );
      annotationsMap.set(
        questionId,
        await annotationService.getAnnotations(testId, questionId, student.id),
      );
    }
  }

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

  const testStatusService = await getTestStatusService();
  const status = await testStatusService.getStatus(
    testId,
    student.id,
    questions.length,
  );

  const testSubmissionService = await getTestSubmissionService();
  const activeSubmission = await testSubmissionService.getActiveSubmission(
    testId,
    student.id,
  );

  const aiGradeService = await getAiGradeService();
  const aiSuggestionsByQuestion = await aiGradeService.getSuggestionsForStudent(
    testId,
    student.id,
  );

  const gradedCount = grades.length;
  const answeredCount = latestAnswers.length;
  const allGraded = answeredCount > 0 && gradedCount >= answeredCount;
  const badgeClassName = allGraded
    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
    : gradedCount > 0
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  const hasAnswers = latestAnswers.length > 0;
  const hasActiveRedoRequest = activeRedoRequest !== null;

  // Ordered ids of the questions that actually render a Save & Next button
  // today: non-MC questions with a non-empty free-text answer (MC is
  // read-only; unanswered free-text and image_answer render no button).
  // Must mirror FreeTextQuestionGradeForm's `{answerText && ...}` gate below
  // exactly, or Save & Next could target a question with nothing to land on.
  const formBearingQuestionIds = questions
    .filter((question) => {
      if (isMcQuestion(question)) {
        return false;
      }
      const rawAnswer = rawAnswerMap.get(question.id);
      return rawAnswer?.type === "free_text" && !!rawAnswer.text;
    })
    .map((question) => question.id)
    .join(",");

  return (
    <div
      data-testid={`student-card-${student.id}`}
      data-student-name={student.name}
    >
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
                {gradedCount}/{answeredCount} graded
              </span>
              {!test.isPractice && (
                <RequestRedoButton
                  testId={testId}
                  courseId={courseId}
                  studentId={student.id}
                  hasActiveRedoRequest={hasActiveRedoRequest}
                />
              )}
              {!test.isPractice && status === TestStatus.Submitted && (
                <AutoGradeWithAiButton
                  testId={testId}
                  courseId={courseId}
                  studentId={student.id}
                  status={status}
                  hasExistingSuggestions={aiSuggestionsByQuestion.size > 0}
                />
              )}
              <ReleaseGradeForStudentControl
                test={test}
                courseId={courseId}
                studentId={student.id}
                submission={activeSubmission}
                status={status}
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
              id: `question-${question.id}`,
              saveAndNext: {
                candidateIds: formBearingQuestionIds,
                currentStudentId: student.id,
                returnPath: basePath,
                mode: "student" as const,
                sort,
              },
            };

            if (isMcQuestion(question)) {
              return (
                <McQuestionGradeForm
                  key={question.id}
                  {...sharedProps}
                  selectedIds={
                    rawAnswer?.type === "mc" ? rawAnswer.selectedIds : []
                  }
                  options={question.options}
                />
              );
            }

            if (question.type === "image_answer") {
              const photos = answerImagesMap.get(question.id) ?? [];
              return (
                <div
                  key={question.id}
                  id={`question-${question.id}`}
                  className="rounded-lg border p-4 space-y-3"
                  data-testid="grade-card"
                >
                  <h4 className="font-medium text-sm">
                    <span className="text-muted-foreground">
                      #{question.order}
                    </span>{" "}
                    {question.title}
                  </h4>
                  {photos.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Student Answer:
                      </p>
                      <AnnotationTool
                        testId={testId}
                        courseId={courseId}
                        questionId={question.id}
                        studentId={student.id}
                        photos={photos}
                        initialAnnotations={
                          annotationsMap.get(question.id) ?? []
                        }
                      />
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      No answer submitted
                    </p>
                  )}
                  {photos.length > 0 && (
                    <CompactGradeForm
                      testId={testId}
                      courseId={courseId}
                      questionId={question.id}
                      studentId={student.id}
                      questionTitle={question.title}
                      questionOrder={question.order}
                      existingScore={grade?.score ?? null}
                      existingFeedback={grade?.feedback ?? null}
                      existingSolution={grade?.solution ?? null}
                      studentStatus={status}
                    />
                  )}
                </div>
              );
            }

            const aiSuggestions: AiGradeSuggestion[] =
              aiSuggestionsByQuestion.get(question.id) ?? [];

            return (
              <FreeTextQuestionGradeForm
                key={question.id}
                {...sharedProps}
                answerText={
                  rawAnswer?.type === "free_text" ? rawAnswer.text : null
                }
              >
                {aiSuggestions.length > 0 && (
                  <AiSuggestionPanel
                    testId={testId}
                    courseId={courseId}
                    studentId={student.id}
                    questionId={question.id}
                    suggestions={aiSuggestions}
                    latestAnswerId={
                      latestAnswerIdByQuestion.get(question.id) ?? null
                    }
                  />
                )}
              </FreeTextQuestionGradeForm>
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
}
