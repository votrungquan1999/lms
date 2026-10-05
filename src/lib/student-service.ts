import { type Collection, type Db, MongoServerError } from "mongodb";
import { assertSchoolId } from "./assert-school-id";

/**
 * Student document stored in the `student` collection.
 */
export interface StudentDocument {
  id: string;
  /** Foreign key to Better Auth's user table. */
  authUserId: string;
  username: string;
  name: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  /** Owning school. Absent or `null` on records not yet assigned — no school can see those. */
  schoolId: string | null;
}

/**
 * Client-facing student interface. `schoolId` is `null` for a student not
 * yet assigned to a school, who gets no session at all.
 */
export interface Student {
  id: string;
  username: string;
  name: string;
  schoolId: string | null;
}

/**
 * Input for creating a student document.
 */
export interface CreateStudentDocumentInput {
  authUserId: string;
  username: string;
  name: string;
  createdBy: string;
}

/**
 * Maps a stored student document to the client-facing student.
 * @param doc - The stored student document.
 */
export function toStudent(doc: StudentDocument): Student {
  return {
    id: doc.id,
    username: doc.username,
    name: doc.name,
    schoolId: doc.schoolId ?? null,
  };
}

/**
 * StudentService — manages one school's students in the `student` collection.
 * Handles student domain data (username, name, role).
 * Auth concerns (credentials, sessions) stay in AuthService; lookups that
 * must see every school live in SchoolDirectory.
 */
/** The username is already taken (in any school). The message is user-facing. */
export class DuplicateUsernameError extends Error {
  constructor() {
    super("Username already exists");
    this.name = "DuplicateUsernameError";
  }
}

/** The sign-in account already owns a student profile. The message is user-facing. */
export class DuplicateAuthAccountError extends Error {
  constructor() {
    super("This account already has a student profile");
    this.name = "DuplicateAuthAccountError";
  }
}

export class StudentService {
  private readonly students: Collection<StudentDocument>;

  constructor(
    db: Db,
    /** The school this service reads and writes. */
    readonly schoolId: string,
  ) {
    assertSchoolId(schoolId, "a student service");
    this.students = db.collection<StudentDocument>("student");
  }

  /**
   * Creates a student document in this service's school.
   * Throws `DuplicateUsernameError` when the username is taken in any
   * school, and `DuplicateAuthAccountError` when the
   * sign-in account already owns one. Both are enforced by the database's
   * own unique indexes, not a find-first check, so a stale caller-side read
   * can never let a duplicate through.
   */
  async createStudentDocument(
    input: CreateStudentDocumentInput,
  ): Promise<Student> {
    const doc: StudentDocument = {
      id: crypto.randomUUID(),
      authUserId: input.authUserId,
      username: input.username,
      name: input.name,
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
      schoolId: this.schoolId,
    };

    try {
      await this.students.insertOne(doc);
    } catch (error) {
      // Told apart by which index refused the insert, never by message
      // text — a document can violate both at once, and only the index
      // that actually fired is a fact MongoDB reports.
      if (error instanceof MongoServerError && error.code === 11000) {
        if (error.keyPattern?.authUserId) {
          throw new DuplicateAuthAccountError();
        }
        if (error.keyPattern?.username) {
          throw new DuplicateUsernameError();
        }
      }
      throw error;
    }

    return toStudent(doc);
  }

  /**
   * Finds this school's students among the given domain IDs; another
   * school's id is skipped like a missing one.
   */
  async findByIds(ids: string[]): Promise<Student[]> {
    if (ids.length === 0) return [];
    const docs = await this.students
      .find({ id: { $in: ids }, schoolId: this.schoolId })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(toStudent);
  }

  /**
   * Lists this school's students.
   */
  async listStudents(): Promise<Student[]> {
    const docs = await this.students
      .find({ schoolId: this.schoolId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map(toStudent);
  }
}
