import type { Collection, Db } from "mongodb";
import type { AnswerService } from "src/lib/answer-service";
import type {
  MultiSelectQuestion,
  QuestionService,
  SingleSelectQuestion,
} from "src/lib/question-service";
import type { TestService } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";

/**
 * Grade document stored in the `grade` collection.
 * One grade per (testId, questionId, studentId) — upsert model.
 */
export interface GradeDocument {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  score: number;
  feedback: string;
  /** Optional per-student correct solution provided by the teacher. */
  solution: string | null;
  gradedAt: Date;
  gradedBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Client-facing grade interface.
 */
export interface Grade {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  score: number;
  feedback: string;
  solution: string | null;
  gradedAt: Date;
}

/**
 * Input for grading a single question.
 */
export interface GradeQuestionInput {
  testId: string;
  questionId: string;
  studentId: string;
  score: number;
  feedback: string;
  solution?: string;
  gradedBy: string;
}

/**
 * GradeService — manages the `grade` collection.
 * One grade per (testId, questionId, studentId) — upsert model.
 */
export class GradeService {
  private readonly grades: Collection<GradeDocument>;

  constructor(
    db: Db,
    private readonly questionService: QuestionService,
    private readonly answerService: AnswerService,
    private readonly testService: TestService,
  ) {
    this.grades = db.collection<GradeDocument>("grade");
  }

  /**
   * Auto-grades a student's answers for an entire test.
   * Only applicable to single_select and multi_select questions.
   */
  async autoGradeTest(testId: string, studentId: string): Promise<Grade[]> {
    const grades: Grade[] = [];
    const questions = await this.questionService.listQuestions(testId);
    const answers = await this.answerService.getLatestAnswers(
      testId,
      studentId,
    );

    for (const question of questions) {
      if (
        question.type !== "single_select" &&
        question.type !== "multi_select"
      ) {
        continue;
      }

      const mcQuestion = question as SingleSelectQuestion | MultiSelectQuestion;
      const studentAnswer = answers.find((a) => a.questionId === question.id);
      if (!studentAnswer) continue;

      let score = 0;
      if (studentAnswer.answer.type === "mc") {
        const correctIds = new Set(
          mcQuestion.options.filter((o) => o.isCorrect).map((o) => o.id),
        );

        if (mcQuestion.type === "single_select") {
          const [selectedId] = studentAnswer.answer.selectedIds;
          score = correctIds.has(selectedId) ? 100 : 0;
        } else if (mcQuestion.type === "multi_select") {
          const studentIds = new Set(studentAnswer.answer.selectedIds);
          if (mcQuestion.mcGradingStrategy === "all_or_nothing") {
            const isExactMatch =
              correctIds.size === studentIds.size &&
              [...correctIds].every((id) => studentIds.has(id));
            score = isExactMatch ? 100 : 0;
          } else if (mcQuestion.mcGradingStrategy === "partial") {
            const totalCorrect = correctIds.size;
            if (totalCorrect === 0) {
              score = 0;
            } else {
              let correctSelections = 0;
              let wrongSelections = 0;

              for (const id of studentIds) {
                if (correctIds.has(id)) {
                  correctSelections++;
                } else {
                  wrongSelections++;
                }
              }

              const rawScore =
                (correctSelections / totalCorrect) * 100 -
                (wrongSelections / totalCorrect) * 100;

              score = Math.max(0, Math.round(rawScore));
            }
          }
        }
      }

      const grade = await this.gradeQuestion({
        testId,
        questionId: question.id,
        studentId,
        score,
        feedback: "",
        gradedBy: "system",
      });
      grades.push(grade);
    }

    return grades;
  }

  /**
   * Grades (or re-grades) a student's answer for a question.
   * Uses upsert: creates if not exists, updates if already graded.
   */
  async gradeQuestion(input: GradeQuestionInput): Promise<Grade> {
    const now = new Date();
    const filter = {
      testId: input.testId,
      questionId: input.questionId,
      studentId: input.studentId,
    };

    const existing = await this.grades.findOne(filter);

    if (existing) {
      await this.grades.updateOne(filter, {
        $set: {
          score: input.score,
          feedback: input.feedback,
          solution: input.solution ?? existing.solution,
          updatedAt: now,
          updatedBy: input.gradedBy,
        },
      });

      return this.toGrade({
        ...existing,
        score: input.score,
        feedback: input.feedback,
        solution: input.solution ?? existing.solution,
        updatedAt: now,
        updatedBy: input.gradedBy,
      });
    }

    const doc: GradeDocument = {
      id: crypto.randomUUID(),
      testId: input.testId,
      questionId: input.questionId,
      studentId: input.studentId,
      score: input.score,
      feedback: input.feedback,
      solution: input.solution ?? null,
      gradedAt: now,
      gradedBy: input.gradedBy,
      updatedAt: null,
      updatedBy: null,
    };

    await this.grades.insertOne(doc);
    return this.toGrade(doc);
  }

  /**
   * Computes the weighted average score for a student on a test.
   *
   * - MC questions with no submitted answer are counted as 0.
   * - Returns null if any **free-text** question has not yet been graded,
   *   since those require manual review before a meaningful total exists.
   */
  async getAverageScore(
    testId: string,
    studentId: string,
  ): Promise<number | null> {
    const questions = await this.questionService.listQuestions(testId);
    if (questions.length === 0) return null;

    const grades = await this.grades
      .find({ testId, studentId })
      .sort({ gradedAt: -1 })
      .toArray();

    // If any free-text question is ungraded, the total is not yet meaningful
    const freeTextUngraded = questions.some(
      (q) =>
        q.type === "free_text" &&
        !grades.some((g) => g.questionId === q.id),
    );
    if (freeTextUngraded) return null;

    let totalWeight = 0;
    let totalWeightedScore = 0;

    for (const q of questions) {
      const g = grades.find((grade) => grade.questionId === q.id);
      const w = q.weight ?? 1;
      totalWeight += w;
      // Ungraded MC questions (student didn't answer) count as 0
      totalWeightedScore += (g?.score ?? 0) * w;
    }

    if (totalWeight === 0) return 0;
    return Math.round(totalWeightedScore / totalWeight);
  }

  /**
   * Gets all grades for a student on a test.
   */
  async getGrades(testId: string, studentId: string): Promise<Grade[]> {
    const docs = await this.grades
      .find({ testId, studentId })
      .sort({ gradedAt: -1 })
      .toArray();
    return docs.map((doc) => this.toGrade(doc));
  }

  /**
   * Gets a specific grade for a question on a test by a student.
   * Returns null if not found.
   */
  async getGrade(
    testId: string,
    questionId: string,
    studentId: string,
  ): Promise<Grade | null> {
    const doc = await this.grades.findOne({ testId, questionId, studentId });
    return doc ? this.toGrade(doc) : null;
  }

  private toGrade(doc: GradeDocument): Grade {
    return {
      id: doc.id,
      testId: doc.testId,
      questionId: doc.questionId,
      studentId: doc.studentId,
      score: doc.score,
      feedback: doc.feedback,
      solution: doc.solution,
      gradedAt: doc.gradedAt,
    };
  }

  /**
   * Safely returns grades for a student, enforcing the atomic reveal and visibility flags.
   * Accepts only IDs — fetches the test internally via TestService.
   */
  async getStudentGrades(
    testId: string,
    studentId: string,
    testStatus: TestStatus,
  ): Promise<Grade[]> {
    if (testStatus !== TestStatus.Graded) {
      return [];
    }
    const test = await this.testService.getTest(testId);
    if (!test) return [];
    if (!test.showGradeAfterSubmit && !test.gradesReleasedAt) {
      return [];
    }
    return this.getGrades(testId, studentId);
  }

  /**
   * Safely returns the average score for a student, enforcing the atomic reveal and visibility flags.
   * Accepts only IDs — fetches the test internally via TestService.
   */
  async getStudentAverageScore(
    testId: string,
    studentId: string,
    testStatus: TestStatus,
  ): Promise<number | null> {
    if (testStatus !== TestStatus.Graded) {
      return null;
    }
    const test = await this.testService.getTest(testId);
    if (!test) return null;
    if (!test.showGradeAfterSubmit && !test.gradesReleasedAt) {
      return null;
    }
    return this.getAverageScore(testId, studentId);
  }
}
