import type { Collection, Db } from "mongodb";

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

  constructor(db: Db) {
    this.grades = db.collection<GradeDocument>("grade");
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
   * Computes the average score for a student on a test.
   * Returns null if not all questions have been graded.
   */
  async getAverageScore(
    testId: string,
    studentId: string,
    totalQuestions: number,
  ): Promise<number | null> {
    const grades = await this.grades
      .find({ testId, studentId })
      .toArray();

    if (grades.length < totalQuestions) {
      return null;
    }

    const sum = grades.reduce((acc, g) => acc + g.score, 0);
    return sum / grades.length;
  }

  /**
   * Gets all grades for a student on a test.
   */
  async getGrades(testId: string, studentId: string): Promise<Grade[]> {
    const docs = await this.grades.find({ testId, studentId }).toArray();
    return docs.map(this.toGrade);
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
}
