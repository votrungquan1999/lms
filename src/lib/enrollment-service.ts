import type { Collection, Db } from "mongodb";

/**
 * Enrollment document stored in the `enrollment` collection.
 */
export interface EnrollmentDocument {
  id: string;
  courseId: string;
  studentId: string;
  enrolledAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * EnrollmentService — manages the `enrollment` collection.
 */
export class EnrollmentService {
  private readonly enrollments: Collection<EnrollmentDocument>;

  constructor(db: Db) {
    this.enrollments = db.collection<EnrollmentDocument>("enrollment");
  }

  /**
   * Enrolls a student in a course. Prevents duplicate enrollments.
   */
  async enrollStudent(
    courseId: string,
    studentId: string,
    createdBy: string,
  ): Promise<void> {
    const existing = await this.enrollments.findOne({ courseId, studentId });
    if (existing) {
      throw new Error("Student is already enrolled in this course");
    }

    const doc: EnrollmentDocument = {
      id: crypto.randomUUID(),
      courseId,
      studentId,
      enrolledAt: new Date(),
      createdBy,
      updatedAt: null,
      updatedBy: null,
    };

    await this.enrollments.insertOne(doc);
  }

  /**
   * Bulk enrolls multiple students in a course.
   * Uses 2 queries: 1 find for existing enrollments, 1 bulk insert for new ones.
   * Returns error if any studentId is not in the provided list (i.e., already enrolled).
   */
  async enrollStudents(
    courseId: string,
    studentIds: string[],
    createdBy: string,
  ): Promise<{ enrolled: number; skipped: number }> {
    if (studentIds.length === 0) {
      return { enrolled: 0, skipped: 0 };
    }

    // Query 1: find all existing enrollments for these students in this course
    const existingEnrollments = await this.enrollments
      .find({ courseId, studentId: { $in: studentIds } })
      .toArray();

    const alreadyEnrolledIds = new Set(
      existingEnrollments.map((e) => e.studentId),
    );

    const toEnroll = studentIds.filter((id) => !alreadyEnrolledIds.has(id));
    const skipped = studentIds.length - toEnroll.length;

    if (toEnroll.length === 0) {
      return { enrolled: 0, skipped };
    }

    // Query 2: bulk insert new enrollments
    const docs: EnrollmentDocument[] = toEnroll.map((studentId) => ({
      id: crypto.randomUUID(),
      courseId,
      studentId,
      enrolledAt: new Date(),
      createdBy,
      updatedAt: null,
      updatedBy: null,
    }));

    await this.enrollments.insertMany(docs);

    return { enrolled: toEnroll.length, skipped };
  }

  /**
   * Lists all course IDs a student is enrolled in.
   */
  async listEnrollmentsByStudent(
    studentId: string,
  ): Promise<{ courseId: string }[]> {
    const docs = await this.enrollments
      .find({ studentId })
      .sort({ enrolledAt: -1 })
      .toArray();

    return docs.map((doc) => ({ courseId: doc.courseId }));
  }

  /**
   * Checks whether a student is enrolled in a specific course.
   */
  async isEnrolled(courseId: string, studentId: string): Promise<boolean> {
    const doc = await this.enrollments.findOne({ courseId, studentId });
    return doc !== null;
  }
}
