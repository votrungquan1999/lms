import { CompactGradeForm } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import { StudentStatusBadge } from "src/app/admin/(dashboard)/grading/student-status-badge";
import { McAnswerChips } from "src/components/mc-answer-chips";
import {
  getAnswerService,
  getGradeService,
  getQuestionService,
  getTestStatusService,
} from "src/lib/services-singleton";
import type { Test } from "src/lib/test-service";

interface RosterStudent {
  id: string;
  name: string;
  username: string;
}

interface GradingDetailQuestionProps {
  test: Test;
  courseId: string;
  /** Question selected via URL (or first-in-order fallback). */
  questionId: string;
  /** Students in roster sort order — used as the candidate list. */
  students: RosterStudent[];
  /** Base path the page is rendered at (no query string). */
  basePath: string;
  /** Current `?sort=` value, preserved in the Save & Next redirect target. */
  sort?: string;
}

/**
 * Question-mode main pane. Renders the focused question's title + content
 * at the top, then one row per enrolled student with their answer and a
 * compact grading form. Sort dropdown is hidden in question-mode; question
 * order is fixed by `question.order`.
 */
export async function GradingDetailQuestion({
  test,
  courseId,
  questionId,
  students,
  basePath,
  sort,
}: GradingDetailQuestionProps) {
  const questionService = await getQuestionService();
  const questions = await questionService.listQuestions(test.id);
  const question = questions.find((q) => q.id === questionId) ?? questions[0];

  if (!question) {
    return (
      <p className="text-sm text-muted-foreground">
        No questions on this test yet.
      </p>
    );
  }

  const answerService = await getAnswerService();
  const gradeService = await getGradeService();
  const testStatusService = await getTestStatusService();

  const rows = await Promise.all(
    students.map(async (s) => {
      const latestAnswers = await answerService.getLatestAnswers(test.id, s.id);
      const answer = latestAnswers.find((a) => a.questionId === question.id);
      const grade = await gradeService.getGrade(test.id, question.id, s.id);
      const status = await testStatusService.getStatus(
        test.id,
        s.id,
        questions.length,
      );
      return { student: s, answer: answer?.answer, grade, status };
    }),
  );

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">
          Q{question.order}. {question.title}
        </h2>
        {question.content && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {question.content}
          </p>
        )}
      </header>

      <ul className="space-y-3">
        {rows.map(({ student, answer, grade, status }) => (
          <li
            key={student.id}
            data-testid={`student-card-${student.id}`}
            className="rounded-md border border-border bg-card p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {student.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  @{student.username}
                </span>
              </p>
              <StudentStatusBadge status={status} />
            </div>

            {answer === undefined ? (
              <p className="text-xs italic text-muted-foreground">
                No answer submitted (counts as 0).
              </p>
            ) : answer.type === "mc" ? (
              <McAnswerChips
                options={
                  question.type === "single_select" ||
                  question.type === "multi_select"
                    ? question.options
                    : []
                }
                selectedIds={answer.selectedIds}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm">{answer.text}</pre>
            )}

            <CompactGradeForm
              testId={test.id}
              courseId={courseId}
              questionId={question.id}
              studentId={student.id}
              questionTitle={question.title}
              questionOrder={question.order}
              existingScore={grade?.score ?? null}
              existingFeedback={grade?.feedback ?? null}
              existingSolution={grade?.solution ?? null}
              studentStatus={status}
              saveAndNext={{
                candidateIds: students.map((s) => s.id).join(","),
                currentStudentId: student.id,
                returnPath: basePath,
                mode: "question" as const,
                sort,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
