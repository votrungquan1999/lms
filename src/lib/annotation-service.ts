import type { Collection, Db } from "mongodb";

/** A single point of a freehand annotation stroke, in normalized (0..1) coords. */
export interface AnnotationPoint {
  x: number;
  y: number;
}

/** One freehand stroke a grader draws over a photo (a colored polyline). */
export interface AnnotationStroke {
  color: string;
  points: AnnotationPoint[];
}

/** A grader's annotations for one of a student's answer photos. */
export interface AnnotationEntry {
  /** The S3 key of the photo these strokes are drawn over. */
  mediaKey: string;
  strokes: AnnotationStroke[];
}

/**
 * Annotation document stored in the `annotation` collection.
 * One document per (testId, questionId, studentId) — upsert model.
 * Deliberately separate from the `grade` collection so saving annotations
 * never creates a grade row (which would otherwise flip the student to
 * "Graded" and unlock premature grade release — see GradeService.getStatus).
 */
export interface AnnotationDocument {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  entries: AnnotationEntry[];
  updatedAt: Date;
  updatedBy: string;
}

/**
 * Input for saving a grader's annotations over a student's answer photos.
 */
export interface SaveAnnotationsInput {
  testId: string;
  questionId: string;
  studentId: string;
  gradedBy: string;
  annotations: AnnotationEntry[];
}

/**
 * AnnotationService — manages the `annotation` collection, independent of the
 * `grade` collection. One document per (testId, questionId, studentId).
 */
export class AnnotationService {
  private readonly annotations: Collection<AnnotationDocument>;

  constructor(db: Db) {
    this.annotations = db.collection<AnnotationDocument>("annotation");
  }

  /**
   * Saves (upserts) a grader's vector annotations over a student's answer
   * photos. Creates no grade row — annotations are stored on their own.
   * @param input - Target ids, the grader, and the annotation entries.
   * @returns The saved annotation entries.
   */
  async saveAnnotations(
    input: SaveAnnotationsInput,
  ): Promise<AnnotationEntry[]> {
    const filter = {
      testId: input.testId,
      questionId: input.questionId,
      studentId: input.studentId,
    };
    await this.annotations.updateOne(
      filter,
      {
        $set: {
          entries: input.annotations,
          updatedAt: new Date(),
          updatedBy: input.gradedBy,
        },
        $setOnInsert: { id: crypto.randomUUID(), ...filter },
      },
      { upsert: true },
    );
    return input.annotations;
  }

  /**
   * Returns the grader's annotation entries for one student's answer to one
   * question, or an empty array when none have been saved.
   */
  async getAnnotations(
    testId: string,
    questionId: string,
    studentId: string,
  ): Promise<AnnotationEntry[]> {
    const doc = await this.annotations.findOne({
      testId,
      questionId,
      studentId,
    });
    return doc?.entries ?? [];
  }
}
