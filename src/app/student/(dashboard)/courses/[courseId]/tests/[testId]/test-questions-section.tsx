import Link from "next/link";
import { MarkdownContent } from "src/components/markdown-content";
import { McAnswerChips } from "src/components/mc-answer-chips";
import { QuestionMedia } from "src/components/question-media.ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Separator } from "src/components/ui/separator";
import type { AnnotationEntry } from "src/lib/annotation-service";
import type { AnswerImage } from "src/lib/answer-image-urls";
import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import { isMcQuestion, type Question } from "src/lib/question-service";
import type { TestStatus } from "src/lib/test-status-service";
import { AnswerForm } from "./answer-form";
import { GradedQuestion } from "./graded-question";
import { SubmitTestButton } from "./submit-test-button";

interface TestQuestionsSectionProps {
  testId: string;
  courseId: string;
  questions: Question[];
  answerMap: Map<string, StudentAnswer>;
  gradeMap: Map<string, Grade>;
  answerImagesMap: Map<string, AnswerImage[]>;
  annotationsMap: Map<string, AnnotationEntry[]>;
  testStatus: TestStatus;
  isSubmitted: boolean;
  hasActiveRedo: boolean;
  canAnswer: boolean;
  correctAnswersVisible: boolean;
  gradeCount: number;
}

/**
 * Renders the test's questions with answer inputs, submitted-answer displays,
 * grade displays, and the submit control. Pure composition off pre-fetched
 * data — all visibility gating is computed by the parent page.
 */
export function TestQuestionsSection({
  testId,
  courseId,
  questions,
  answerMap,
  gradeMap,
  answerImagesMap,
  annotationsMap,
  testStatus,
  isSubmitted,
  hasActiveRedo,
  canAnswer,
  correctAnswersVisible,
  gradeCount,
}: TestQuestionsSectionProps) {
  return (
    <section className="w-full space-y-8">
      {questions.length > 0 ? (
        questions.map((question) => {
          const grade = gradeMap.get(question.id);
          const studentAnswer = answerMap.get(question.id);
          const isMC = isMcQuestion(question);

          // For MC questions, build the option list that's safe to ship to
          // the client. When the gate is closed, every option's `isCorrect`
          // becomes `false` so selected chips render in the neutral
          // "selected + !isCorrect" path without revealing the answer key.
          const safeOptions = isMcQuestion(question)
            ? correctAnswersVisible
              ? question.options
              : question.options.map((o) => ({ ...o, isCorrect: false }))
            : [];

          // Read-only graded view: collapsible card tinted by score band.
          // (During a redo, canAnswer is true so the answer form is shown
          // instead.)
          if (grade && !canAnswer) {
            return (
              <GradedQuestion
                key={question.id}
                question={question}
                studentAnswer={studentAnswer}
                grade={grade}
                isMC={isMC}
                options={safeOptions}
                correctAnswersVisible={correctAnswersVisible}
                testStatus={testStatus}
                answerImages={answerImagesMap.get(question.id)}
                annotations={annotationsMap.get(question.id)}
              />
            );
          }

          return (
            <Card key={question.id}>
              <CardHeader>
                <CardTitle className="text-lg">
                  Question {question.order}: {question.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MarkdownContent content={question.content} />
                <QuestionMedia media={question.media} />

                {/* ── Answer input (when not submitted, or redo active) ── */}
                {canAnswer &&
                  (isMC ? (
                    <AnswerForm
                      testId={testId}
                      courseId={courseId}
                      questionId={question.id}
                      questionType={question.type}
                      options={safeOptions}
                      existingSelectedIds={
                        studentAnswer?.type === "mc"
                          ? studentAnswer.selectedIds
                          : []
                      }
                    />
                  ) : question.type === "image_answer" ? (
                    <AnswerForm
                      testId={testId}
                      courseId={courseId}
                      questionId={question.id}
                      questionType="image_answer"
                      existingImageCount={
                        studentAnswer?.type === "image"
                          ? studentAnswer.mediaKeys.length
                          : 0
                      }
                    />
                  ) : (
                    <AnswerForm
                      testId={testId}
                      courseId={courseId}
                      questionId={question.id}
                      questionType="free_text"
                      existingAnswer={
                        studentAnswer?.type === "free_text"
                          ? studentAnswer.text
                          : ""
                      }
                    />
                  ))}

                {/* ── Submitted answer display ── */}
                {isSubmitted && !hasActiveRedo && studentAnswer && (
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Your Answer:
                    </p>
                    {studentAnswer.type === "mc" && isMC ? (
                      <McAnswerChips
                        selectedIds={studentAnswer.selectedIds}
                        options={safeOptions}
                      />
                    ) : studentAnswer.type === "free_text" ? (
                      <p className="whitespace-pre-wrap text-sm">
                        {studentAnswer.text}
                      </p>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      ) : (
        <p className="text-center text-muted-foreground">
          No questions have been added to this test yet.
        </p>
      )}

      {canAnswer && questions.length > 0 && (
        <>
          <Separator />
          <SubmitTestButton
            testId={testId}
            courseId={courseId}
            totalQuestions={questions.length}
            answeredQuestions={answerMap.size}
          />
        </>
      )}

      {isSubmitted && !hasActiveRedo && gradeCount === 0 && (
        <div className="space-y-3">
          <div className="rounded-md border border-info/30 bg-info/10 p-3 text-sm text-foreground">
            Your test has been submitted and is waiting to be graded.
          </div>
          <Link
            href={`/student/courses/${courseId}`}
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Course
          </Link>
        </div>
      )}
    </section>
  );
}
