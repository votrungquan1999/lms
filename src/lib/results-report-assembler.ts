import type { AnswerService, StudentAnswer } from "./answer-service";
import type { GradeService } from "./grade-service";
import type { Question, QuestionService } from "./question-service";
import type { Student, StudentService } from "./student-service";
import type { TestFeedbackService } from "./test-feedback-service";
import type { TestService } from "./test-service";
import type { TestStatus, TestStatusService } from "./test-status-service";

/**
 * Whether a score is finalised (graded, including a genuine 0) or still
 * awaiting manual grading (pending). Distinct from `TestStatus`, which tracks
 * the whole-test lifecycle.
 */
export enum QuestionGradeStatus {
  Graded = "graded",
  Pending = "pending",
}

/**
 * One question's breakdown within a selected test: the question title, the
 * student's resolved answer (free-text text or MC option labels), and the
 * per-question score/feedback.
 */
export interface QuestionBreakdownEntry {
  questionId: string;
  title: string;
  /** Resolved answer text(s). Empty when the student did not answer. */
  answer: string[];
  /** Pending when there is no grade row yet; Graded once scored (incl. 0). */
  gradeStatus: QuestionGradeStatus;
  /** null when the question has no grade row yet. */
  score: number | null;
  /** null when the question has no grade row yet. */
  feedback: string | null;
}

/**
 * One selected test's summary line for a student in the results report.
 */
export interface StudentTestReportEntry {
  testId: string;
  title: string;
  score: number | null;
  /** Pending when the weighted average is null (manual review outstanding). */
  gradeStatus: QuestionGradeStatus;
  status: TestStatus;
  overallFeedback: string | null;
  questions: QuestionBreakdownEntry[];
}

/**
 * A per-student results report covering the caller-selected tests, in the
 * caller's selected order.
 */
export interface StudentResultsReport {
  student: Student;
  tests: StudentTestReportEntry[];
}

/**
 * Assembles a per-student, multi-test results report from the underlying
 * services. Pure read/composition: fetches no presentation, derives the
 * per-test score/status/feedback that the PDF renderer later displays.
 */
export class ResultsReportAssembler {
  constructor(
    private readonly studentService: StudentService,
    private readonly testService: TestService,
    private readonly questionService: QuestionService,
    private readonly answerService: AnswerService,
    private readonly gradeService: GradeService,
    private readonly testStatusService: TestStatusService,
    private readonly testFeedbackService: TestFeedbackService,
  ) {}

  /**
   * Builds the report for one student across the selected tests.
   * @param studentId - The student the report is about.
   * @param testIds - The selected test IDs, in the order they should appear.
   * @returns The assembled report.
   */
  async buildReport(
    studentId: string,
    testIds: string[],
  ): Promise<StudentResultsReport> {
    const [student] = await this.studentService.findByIds([studentId]);
    if (!student) {
      throw new Error(`Student not found: ${studentId}`);
    }

    const tests: StudentTestReportEntry[] = [];
    for (const testId of testIds) {
      const test = await this.testService.getTest(testId);
      if (!test) continue;

      const questions = await this.questionService.listQuestions(testId);
      const score = await this.gradeService.getAverageScore(testId, studentId);
      const status = await this.testStatusService.getStatus(
        testId,
        studentId,
        questions.length,
      );
      const overallFeedback = await this.testFeedbackService.getTestFeedback(
        testId,
        studentId,
      );

      const answers = await this.answerService.getLatestAnswers(
        testId,
        studentId,
      );
      const grades = await this.gradeService.getGrades(testId, studentId);

      const questionBreakdown: QuestionBreakdownEntry[] = questions.map((q) => {
        const answer = answers.find((a) => a.questionId === q.id);
        const grade = grades.find((g) => g.questionId === q.id);
        return {
          questionId: q.id,
          title: q.title,
          answer: resolveAnswer(q, answer?.answer),
          gradeStatus: grade
            ? QuestionGradeStatus.Graded
            : QuestionGradeStatus.Pending,
          score: grade ? grade.score : null,
          feedback: grade ? grade.feedback : null,
        };
      });

      tests.push({
        testId,
        title: test.title,
        score,
        gradeStatus:
          score === null
            ? QuestionGradeStatus.Pending
            : QuestionGradeStatus.Graded,
        status,
        overallFeedback,
        questions: questionBreakdown,
      });
    }

    return { student, tests };
  }
}

/**
 * Resolves a student's answer to human-readable text. Free-text yields its
 * text; MC yields the selected options' labels (`option.text`) in the
 * question's option order, dropping unknown ids. Returns `[]` when unanswered.
 * @param question - The question being answered.
 * @param answer - The student's latest answer, or undefined when unanswered.
 */
function resolveAnswer(
  question: Question,
  answer: StudentAnswer | undefined,
): string[] {
  if (!answer) return [];
  if (answer.type === "free_text") return [answer.text];

  if (question.type === "free_text") return [];
  const selected = new Set(answer.selectedIds);
  return question.options
    .filter((option) => selected.has(option.id))
    .map((option) => option.text);
}
