import Link from "next/link";
import { MarkdownContent } from "src/components/markdown-content";
import { McAnswerChips } from "src/components/mc-answer-chips";
import { Badge } from "src/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Separator } from "src/components/ui/separator";
import type { StudentAnswer } from "src/lib/answer-service";
import type { Grade } from "src/lib/grade-service";
import type { Question } from "src/lib/question-service";
import { TestStatus } from "src/lib/test-status-service";
import { AnswerForm } from "./answer-form";
import { DiffViewer } from "./diff-viewer";
import { SubmitTestButton } from "./submit-test-button";

interface TestQuestionsSectionProps {
  testId: string;
  courseId: string;
  questions: Question[];
  answerMap: Map<string, StudentAnswer>;
  gradeMap: Map<string, Grade>;
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
          const isMC =
            question.type === "single_select" ||
            question.type === "multi_select";

          // For MC questions, build the option list that's safe to ship to
          // the client. When the gate is closed, every option's `isCorrect`
          // becomes `false` so selected chips render in the neutral
          // "selected + !isCorrect" path without revealing the answer key.
          const safeOptions =
            question.type === "single_select" ||
            question.type === "multi_select"
              ? correctAnswersVisible
                ? question.options
                : question.options.map((o) => ({ ...o, isCorrect: false }))
              : [];

          return (
            <Card key={question.id}>
              <CardHeader>
                <CardTitle className="text-lg">
                  Question {question.order}: {question.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MarkdownContent content={question.content} />

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

                {/* ── Grade display (only when atomic reveal unlocks) ── */}
                {grade && (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="info" className="text-sm font-semibold">
                        {grade.score}/100
                      </Badge>
                      {isMC && testStatus === TestStatus.Graded && (
                        <span className="text-xs text-muted-foreground">
                          (auto-graded)
                        </span>
                      )}
                    </div>
                    {isMC &&
                      studentAnswer?.type === "mc" &&
                      correctAnswersVisible && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Your Selection:
                          </p>
                          <McAnswerChips
                            selectedIds={studentAnswer.selectedIds}
                            options={safeOptions}
                            showCorrectAnswers={correctAnswersVisible}
                          />
                        </div>
                      )}
                    {grade.feedback && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Teacher Feedback:
                        </p>
                        <p className="text-sm whitespace-pre-wrap">
                          {grade.feedback}
                        </p>
                      </div>
                    )}
                    {grade.solution && studentAnswer && !isMC && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Diff Comparison:
                        </p>
                        <DiffViewer
                          studentAnswer={
                            studentAnswer.type === "free_text"
                              ? studentAnswer.text
                              : ""
                          }
                          solution={grade.solution}
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
