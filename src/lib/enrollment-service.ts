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
 * Input for setEnrolledStudents. `desired` and `observed` are both
 * `string[]` and adjacent in a positional signature would type-check
 * transposed — an object makes that swap a named-property mismatch instead
 * of a silent reversal of the admin's edit.
 */
interface SetEnrolledStudentsInput {
  desired: string[];
  observed: string[];
  updatedBy: string;
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
   * Enrolls a student in a course. Already-enrolled is a no-op success —
   * this makes an enrollment retry (e.g. after an interrupted approval) safe.
   */
  async enrollStudent(
    courseId: string,
    studentId: string,
    createdBy: string,
  ): Promise<void> {
    const existing = await this.enrollments.findOne({ courseId, studentId });
    if (existing) {
      return;
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
   * Compare-and-set batch update: enrolls students newly present in
   * `desired`, and removes students who were observed enrolled but are now
   * missing from `desired`. NOT a PUT/replace — see `observed` below.
   *
   * `observed` is the enrollment snapshot the admin's dialog was opened
   * with. Removal is restricted to ids present in both that snapshot and
   * the live database but absent from `desired` — an enrollment made after
   * the dialog opened was never shown to the admin, so it can never be a
   * removal candidate (BUG-2: it was previously deleted just for being
   * absent from a `desired` list computed before it existed).
   */
  async setEnrolledStudents(
    courseId: string,
    { desired, observed, updatedBy }: SetEnrolledStudentsInput,
  ): Promise<void> {
    const currentStudentIds = await this.listEnrollmentsByCourse(courseId);

    const desiredSet = new Set(desired);
    const currentSet = new Set(currentStudentIds);
    const observedSet = new Set(observed);

    // Students to add (in desired but not in current)
    const toAdd = desired.filter((id) => !currentSet.has(id));

    // Students to remove — must have been observed AND now be missing from
    // desired. Current-but-unobserved ids (a mid-dialog enrollment) are
    // never candidates, no matter what `desired` contains.
    const toRemove = currentStudentIds.filter(
      (id) => observedSet.has(id) && !desiredSet.has(id),
    );

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
