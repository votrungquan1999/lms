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
    const docs = toEnroll.map((studentId) =>
      this.makeEnrollmentDoc(courseId, studentId, createdBy),
    );

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
   * Lists all student IDs enrolled in a specific course.
   */
  async listEnrollmentsByCourse(courseId: string): Promise<string[]> {
    const docs = await this.enrollments
      .find({ courseId })
      .sort({ enrolledAt: -1 })
      .toArray();

    return docs.map((doc) => doc.studentId);
  }

  /**
   * Checks whether a student is enrolled in a specific course.
   */
  async isEnrolled(courseId: string, studentId: string): Promise<boolean> {
    const doc = await this.enrollments.findOne({ courseId, studentId });
    return doc !== null;
  }

  /**
   * Idempotent batch update: sets the enrolled students for a course
   * to exactly the provided list. Enrolls new students, removes
   * students no longer in the list. Like a PUT operation.
   */
  async setEnrolledStudents(
    courseId: string,
    desiredStudentIds: string[],
    updatedBy: string,
  ): Promise<void> {
    const currentStudentIds = await this.listEnrollmentsByCourse(courseId);

    const desiredSet = new Set(desiredStudentIds);
    const currentSet = new Set(currentStudentIds);

    // Students to add (in desired but not in current)
    const toAdd = desiredStudentIds.filter((id) => !currentSet.has(id));

    // Students to remove (in current but not in desired)
    const toRemove = currentStudentIds.filter((id) => !desiredSet.has(id));

    // Enroll new students
    if (toAdd.length > 0) {
      const docs = toAdd.map((studentId) =>
        this.makeEnrollmentDoc(courseId, studentId, updatedBy),
      );
      await this.enrollments.insertMany(docs);
    }

    // Remove unenrolled students
    if (toRemove.length > 0) {
      await this.enrollments.deleteMany({
        courseId,
        studentId: { $in: toRemove },
      });
    }
  }

  private makeEnrollmentDoc(
    courseId: string,
    studentId: string,
    createdBy: string,
  ): EnrollmentDocument {
    return {
      id: crypto.randomUUID(),
      courseId,
      studentId,
      enrolledAt: new Date(),
      createdBy,
      updatedAt: null,
      updatedBy: null,
    };
  }
}
