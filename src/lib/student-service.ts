import type { Collection, Db } from "mongodb";

/**
 * Student document stored in the `student` collection.
 */
export interface StudentDocument {
  id: string;
  /** Foreign key to Better Auth's user table. */
  authUserId: string;
  username: string;
  name: string;
  role: "student";
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Client-facing student interface.
 */
export interface Student {
  id: string;
  username: string;
  name: string;
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
 * StudentService — manages the `student` collection.
 * Handles student domain data (username, name, role).
 * Auth concerns (credentials, sessions) stay in AuthService.
 */
export class StudentService {
  private readonly students: Collection<StudentDocument>;

  constructor(db: Db) {
    this.students = db.collection<StudentDocument>("student");
  }

  /**
   * Creates a student document.
   */
  async createStudentDocument(
    input: CreateStudentDocumentInput,
  ): Promise<Student> {
    const existing = await this.students.findOne({ username: input.username });
    if (existing) {
      throw new Error("Username already exists");
    }

    const doc: StudentDocument = {
      id: crypto.randomUUID(),
      authUserId: input.authUserId,
      username: input.username,
      name: input.name,
      role: "student",
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
    };

    await this.students.insertOne(doc);

    return {
      id: doc.id,
      username: doc.username,
      name: doc.name,
    };
  }

  /**
   * Finds a student by username.
   */
  async findByUsername(username: string): Promise<Student | null> {
    const doc = await this.students.findOne({ username });
    if (!doc) {
      return null;
    }
    return { id: doc.id, username: doc.username, name: doc.name };
  }

  /**
   * Finds a student by their Better Auth user ID.
   */
  async findByAuthUserId(authUserId: string): Promise<Student | null> {
    const doc = await this.students.findOne({ authUserId });
    if (!doc) {
      return null;
    }
    return { id: doc.id, username: doc.username, name: doc.name };
  }

  /**
   * Lists all students.
   */
  async listStudents(): Promise<Student[]> {
    const docs = await this.students.find({}).sort({ createdAt: -1 }).toArray();

    return docs.map((doc) => ({
      id: doc.id,
      username: doc.username,
      name: doc.name,
    }));
  }
}
