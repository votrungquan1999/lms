import { type Collection, type Db, MongoServerError } from "mongodb";
import type { CourseDocument } from "./course-service";
import type { StudentDocument } from "./student-service";

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
 * EnrollmentService — manages one school's enrolments in the `enrollment`
 * collection. Enrolment rows carry no school, so every read keeps only rows
 * whose course and student are both this school's, and every write refuses
 * a course or student from anywhere else.
 */
export class EnrollmentService {
  private readonly enrollments: Collection<EnrollmentDocument>;
  private readonly courses: Collection<CourseDocument>;
  private readonly students: Collection<StudentDocument>;

  constructor(
    db: Db,
    private readonly schoolId: string,
  ) {
    // Fail closed: a missing school would match `{ schoolId: null }`, which
    // is exactly the courses and students no school owns yet.
    if (!schoolId) {
      throw new Error("A school is required to build an enrollment service");
    }
    this.enrollments = db.collection<EnrollmentDocument>("enrollment");
    this.courses = db.collection<CourseDocument>("course");
    this.students = db.collection<StudentDocument>("student");
  }

  /**
   * Enrolls a student in a course. Already-enrolled is a no-op success —
   * this makes an enrollment retry (e.g. after an interrupted approval) safe.
   * The pre-check below is a fast path, not the guard — a unique index on
   * {courseId, studentId} (see `ensureIndexes` in database.ts) is the real
   * backstop against two concurrent callers both passing the pre-check.
   * @throws "Course not found" or "Student not found" for one outside this school.
   */
  async enrollStudent(
    courseId: string,
    studentId: string,
    createdBy: string,
  ): Promise<void> {
    await this.assertOwnCourse(courseId);
    await this.assertOwnStudents([studentId]);

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

    try {
      await this.enrollments.insertOne(doc);
    } catch (error) {
      // Lost the race to the unique index — another writer already enrolled
      // this pair, which is exactly the outcome the existing-check above
      // was trying to reach; treat it the same way (a no-op success).
      if (error instanceof MongoServerError && error.code === 11000) {
        return;
      }
      throw error;
    }
  }

  /**
   * Bulk enrolls multiple students in a course.
   * Uses 2 queries: 1 find for existing enrollments, 1 bulk insert for new ones.
   * Returns error if any studentId is not in the provided list (i.e., already enrolled).
   * @throws "Course not found" or "Student not found" for one outside this
   * school, before anyone in the batch is enrolled.
   */
  async enrollStudents(
    courseId: string,
    studentIds: string[],
    createdBy: string,
  ): Promise<{ enrolled: number; skipped: number }> {
    if (studentIds.length === 0) {
      return { enrolled: 0, skipped: 0 };
    }
    await this.assertOwnCourse(courseId);
    await this.assertOwnStudents(studentIds);

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
   * Lists the IDs of this school's courses one of this school's students is
   * enrolled in, newest enrolment first; another school's student has none.
   * A row naming another school's course is dropped.
   */
  async listEnrollmentsByStudent(
    studentId: string,
  ): Promise<{ courseId: string }[]> {
    const [ownStudentIds, docs] = await Promise.all([
      this.ownStudentIds([studentId]),
      this.enrollments.find({ studentId }).sort({ enrolledAt: -1 }).toArray(),
    ]);
    if (!ownStudentIds.has(studentId)) {
      return [];
    }
    const courseIds = docs.map((doc) => doc.courseId);

    const ownCourseIds = await this.ownCourseIds(courseIds);
    return courseIds
      .filter((id) => ownCourseIds.has(id))
      .map((courseId) => ({ courseId }));
  }

  /**
   * Lists the IDs of this school's students enrolled in one of this school's
   * courses, newest enrolment first; another school's course lists nobody.
   * Enrolments carry no school, so a row naming another school's student is
   * dropped here rather than by every caller.
   */
  async listEnrollmentsByCourse(courseId: string): Promise<string[]> {
    const [isOwnCourse, docs] = await Promise.all([
      this.isOwnCourse(courseId),
      this.enrollments.find({ courseId }).sort({ enrolledAt: -1 }).toArray(),
    ]);
    if (!isOwnCourse) {
      return [];
    }
    const studentIds = docs.map((doc) => doc.studentId);

    const ownStudentIds = await this.ownStudentIds(studentIds);
    return studentIds.filter((id) => ownStudentIds.has(id));
  }

  /**
   * Checks whether one of this school's students is enrolled in one of this
   * school's courses. An enrolment row alone is not proof: it carries no school.
   */
  async isEnrolled(courseId: string, studentId: string): Promise<boolean> {
    const [doc, isOwnCourse, ownStudentIds] = await Promise.all([
      this.enrollments.findOne({ courseId, studentId }),
      this.isOwnCourse(courseId),
      this.ownStudentIds([studentId]),
    ]);
    return doc !== null && isOwnCourse && ownStudentIds.has(studentId);
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
   * absent from a `desired` list computed before it existed). The live set
   * holds only this school's students, so another school's enrolment is
   * never a removal candidate either.
   * @throws "Course not found" for another school's course, and "Student not
   * found" when an id to add is not this school's student.
   */
  async setEnrolledStudents(
    courseId: string,
    { desired, observed, updatedBy }: SetEnrolledStudentsInput,
  ): Promise<void> {
    await this.assertOwnCourse(courseId);
    const currentStudentIds = await this.listEnrollmentsByCourse(courseId);

    const desiredSet = new Set(desired);
    const currentSet = new Set(currentStudentIds);
    const observedSet = new Set(observed);

    // Students to add (in desired but not in current)
    const toAdd = desired.filter((id) => !currentSet.has(id));
    await this.assertOwnStudents(toAdd);

    // Students to remove — must have been observed AND now be missing from
    // desired. Current-but-unobserved ids (a mid-dialog enrollment) are
    // never candidates, no matter what `desired` contains.
    const toRemove = currentStudentIds.filter(
      (id) => observedSet.has(id) && !desiredSet.has(id),
    );

    // Enroll new students. Unordered — a race losing one pair to the unique
    // index (e.g. a concurrent approve(), R8) must not block the rest of
    // this batch's unrelated, non-conflicting inserts.
    if (toAdd.length > 0) {
      const docs = toAdd.map((studentId) =>
        this.makeEnrollmentDoc(courseId, studentId, updatedBy),
      );
      try {
        await this.enrollments.insertMany(docs, { ordered: false });
      } catch (error) {
        // Lost the race on one or more pairs — the unique index already
        // stopped the duplicate; nothing further to reconcile here.
        if (!(error instanceof MongoServerError && error.code === 11000)) {
          throw error;
        }
      }
    }

    // Remove unenrolled students
    if (toRemove.length > 0) {
      await this.enrollments.deleteMany({
        courseId,
        studentId: { $in: toRemove },
      });
    }
  }

  /**
   * Whether `courseId` is one of this school's courses.
   * @param courseId - The course an enrolment read or write names.
   */
  private async isOwnCourse(courseId: string): Promise<boolean> {
    const course = await this.courses.findOne(
      { id: courseId, schoolId: this.schoolId },
      { projection: { _id: 1 } },
    );
    return course !== null;
  }

  /**
   * Refuses a write naming a course outside this school.
   * @param courseId - The course a write would enrol into.
   * @throws "Course not found" when the course is missing or another school's.
   */
  private async assertOwnCourse(courseId: string): Promise<void> {
    if (!(await this.isOwnCourse(courseId))) {
      throw new Error("Course not found");
    }
  }

  /**
   * Refuses a write naming any student outside this school.
   * @param studentIds - The students a write would enrol.
   * @throws "Student not found" when any student is missing or another school's.
   */
  private async assertOwnStudents(studentIds: string[]): Promise<void> {
    const ownStudentIds = await this.ownStudentIds(studentIds);
    if (studentIds.some((id) => !ownStudentIds.has(id))) {
      throw new Error("Student not found");
    }
  }

  /**
   * Returns the subset of `ids` that are this school's courses.
   * @param ids - Course ids read from enrolment rows.
   */
  private async ownCourseIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const docs = await this.courses
      .find(
        { id: { $in: ids }, schoolId: this.schoolId },
        { projection: { id: 1 } },
      )
      .toArray();
    return new Set(docs.map((doc) => doc.id));
  }

  /**
   * Returns the subset of `ids` that are this school's students.
   * @param ids - Student ids read from enrolment rows or a caller.
   */
  private async ownStudentIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const docs = await this.students
      .find(
        { id: { $in: ids }, schoolId: this.schoolId },
        { projection: { id: 1 } },
      )
      .toArray();
    return new Set(docs.map((doc) => doc.id));
  }

  /** Builds a new enrolment row for one student in one course. */
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
