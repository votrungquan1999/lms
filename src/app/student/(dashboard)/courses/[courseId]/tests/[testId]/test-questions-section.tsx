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
  /** Whole-test practice flag — drives the MC reveal-gate branch below. */
  isPractice: boolean;
  /** Per-question practice reveal gate: isPractice && this question answered. */
  revealMap: Map<string, boolean>;
  /** Per-question submission counts, for the practice "Attempt N" indicator. */
  attemptCountMap: Map<string, number>;
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
  isPractice,
  revealMap,
  attemptCountMap,
  gradeCount,
}: TestQuestionsSectionProps) {
  return (
    <section className="w-full space-y-8">
      {questions.length > 0 ? (
        questions.map((question) => {
          const grade = gradeMap.get(question.id);
          const studentAnswer = answerMap.get(question.id);
          const isMC = isMcQuestion(question);

          // MC reveal gate: in practice, per-question (overrides the per-test
          // flag per D5); outside practice, the existing per-test flag.
          // `revealMap` is always false when !isPractice, so the two arms
          // can't be collapsed into one shared boolean.
          const mcRevealOpen = isPractice
            ? (revealMap.get(question.id) ?? false)
            : correctAnswersVisible;

          // For MC questions, build the option list that's safe to ship to
          // the client. When the gate is closed, every option's `isCorrect`
          // becomes `false` so selected chips render in the neutral
          // "selected + !isCorrect" path without revealing the answer key.
          const safeOptions = isMcQuestion(question)
            ? mcRevealOpen
              ? question.options
              : question.options.map((o) => ({ ...o, isCorrect: false }))
            : [];

          // Practice-only MC reveal: `revealMap` already encodes
          // isPractice && answered, so no separate isPractice check needed
          // here (unlike mcRevealOpen above, which also serves non-practice).
          const hasMcReveal =
            isMC &&
            revealMap.get(question.id) === true &&
            studentAnswer?.type === "mc";

          // Free_text reveal gate. Asserts `revealMap` directly (like
          // `hasMcReveal`) rather than trusting the page-level scrub — so a
          // future caller that skips the scrub can't leak the model answer.
          // The field-presence check stays for the R4 graceful partial: no
          // card at all when neither referenceAnswer nor explanation is authored.
          const hasFreeTextReveal =
            question.type === "free_text" &&
            revealMap.get(question.id) === true &&
            !!studentAnswer &&
            !!(question.referenceAnswer || question.explanation);

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

                {/* ── Practice-mode reveal (free_text and MC) ──
                    free_text: `question.referenceAnswer`/`.explanation` only
                    survive the page-level scrub when the reveal gate is
                    open, so presence here already implies isPractice +
                    answered. Graceful partial (R4): render whichever
                    field(s) are authored; render nothing if neither is (no
                    card at all — frozen decision, doesn't extend to MC since
                    MC's chip content always exists once answered).
                    MC: `hasMcReveal` gates a NEW surface (D5) — the existing
                    "Submitted answer display" chips above are gated on the
                    whole-test `isSubmitted` flag, which stays false
                    throughout the practice pre-finalize loop, so they can't
                    serve as this reveal. */}
                {(hasFreeTextReveal || hasMcReveal) && (
                  <div className="rounded-md border bg-muted/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Practice Reveal
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Attempt {attemptCountMap.get(question.id) ?? 0}
                      </p>
                    </div>
                    {hasFreeTextReveal && (
                      <>
                        {question.type === "free_text" &&
                          question.referenceAnswer && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Model Answer
                              </p>
                              <p className="whitespace-pre-wrap text-sm">
                                {question.referenceAnswer}
                              </p>
                            </div>
                          )}
                        {question.type === "free_text" &&
                          question.explanation && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Explanation
                              </p>
                              <p className="whitespace-pre-wrap text-sm">
                                {question.explanation}
                              </p>
                            </div>
                          )}
                      </>
                    )}
                    {hasMcReveal && studentAnswer?.type === "mc" && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Result
                        </p>
                        <McAnswerChips
                          selectedIds={studentAnswer.selectedIds}
                          options={safeOptions}
                          showCorrectAnswers
                        />
                      </div>
                    )}
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
