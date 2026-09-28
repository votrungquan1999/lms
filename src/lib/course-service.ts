import type { Collection, Db } from "mongodb";

/**
 * A downloadable course material as stored on the course document.
 * Stores the S3 `key`, never a URL — signed URLs are minted at render time.
 */
export interface CourseMaterialDocument {
  key: string;
  contentType: string;
  fileName: string;
  size: number;
  order: number;
  uploadedAt: Date;
}

/**
 * Course document stored in the `course` collection.
 */
export interface CourseDocument {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  materials: CourseMaterialDocument[];
  /** Static join-link token (D2). Absent key and `null` read identically — no migration exists. */
  inviteToken: string | null;
  /** Owning school. Absent or `null` on records not yet assigned — no school can see those. */
  schoolId: string | null;
}

/**
 * Client-facing course material. `url` is empty until a URL minter fills it.
 */
export interface CourseMaterial {
  key: string;
  contentType: string;
  fileName: string;
  size: number;
  order: number;
  uploadedAt: Date;
  url: string;
}

/**
 * Client-facing course interface.
 */
export interface Course {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  materials: CourseMaterial[];
  inviteToken: string | null;
}

/**
 * Input for creating a new course.
 */
export interface CreateCourseInput {
  title: string;
  description: string;
  createdBy: string;
}

/**
 * Input for adding a downloadable material to a course.
 */
export interface AddCourseMaterialInput {
  key: string;
  contentType: string;
  fileName: string;
  size: number;
}

/**
 * Maps a stored course document to the client-facing course, surfacing
 * materials with an empty `url` placeholder (minted at render time). Shared
 * with the platform-wide school directory.
 * @param doc - The stored course document.
 * @returns The client-facing course.
 */
export function toCourse(doc: CourseDocument): Course {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    createdAt: doc.createdAt,
    inviteToken: doc.inviteToken ?? null,
    materials: (doc.materials ?? [])
      .map((material) => ({
        key: material.key,
        contentType: material.contentType,
        fileName: material.fileName,
        size: material.size,
        order: material.order,
        uploadedAt: material.uploadedAt,
        url: "",
      }))
      .sort((a, b) => a.order - b.order),
  };
}

/**
 * CourseService — manages one school's courses in the `course` collection.
 */
export class CourseService {
  private readonly courses: Collection<CourseDocument>;

  constructor(
    db: Db,
    private readonly schoolId: string,
  ) {
    // Fail closed: a missing school would query `{ schoolId: null }`, which
    // matches exactly the courses no school owns yet.
    if (!schoolId) {
      throw new Error("A school is required to build a course service");
    }
    this.courses = db.collection<CourseDocument>("course");
  }

  async createCourse(input: CreateCourseInput): Promise<Course> {
    const doc: CourseDocument = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description,
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
      materials: [],
      inviteToken: null,
      schoolId: this.schoolId,
    };

    await this.courses.insertOne(doc);

    return toCourse(doc);
  }

  async getCourse(courseId: string): Promise<Course | null> {
    const doc = await this.courses.findOne({
      id: courseId,
      schoolId: this.schoolId,
    });
    if (!doc) {
      return null;
    }
    return toCourse(doc);
  }

  async getCoursesByIds(courseIds: string[]): Promise<Course[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const docs = await this.courses
      .find({ id: { $in: courseIds }, schoolId: this.schoolId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => toCourse(doc));
  }

  async listCourses(): Promise<Course[]> {
    const docs = await this.courses
      .find({ schoolId: this.schoolId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => toCourse(doc));
  }

  /**
   * Adds a downloadable material to a course, appending it after any existing
   * materials. The `order` is derived from the current material count.
   * @param courseId - The course to attach the material to.
   * @param input - The material metadata (S3 key, content type, name, size).
   * @throws If the course does not exist in this school.
   */
  async addCourseMaterial(
    courseId: string,
    input: AddCourseMaterialInput,
  ): Promise<void> {
    const course = await this.courses.findOne({
      id: courseId,
      schoolId: this.schoolId,
    });
    if (!course) {
      throw new Error("Course not found");
    }

    const material: CourseMaterialDocument = {
      key: input.key,
      contentType: input.contentType,
      fileName: input.fileName,
      size: input.size,
      order: (course.materials ?? []).length,
      uploadedAt: new Date(),
    };

    await this.courses.updateOne(
      { id: courseId },
      { $push: { materials: material } },
    );
  }

  /**
   * Removes a material from a course by its S3 key. No-op when the key is
   * unknown (`$pull` matches nothing) — only a missing course throws.
   * @param courseId - The course to remove the material from.
   * @param materialKey - The S3 key of the material to remove.
   * @throws If the course does not exist in this school.
   */
  async removeCourseMaterial(
    courseId: string,
    materialKey: string,
  ): Promise<void> {
    const result = await this.courses.updateOne(
      { id: courseId, schoolId: this.schoolId },
      { $pull: { materials: { key: materialKey } } },
    );
    if (result.matchedCount === 0) {
      throw new Error("Course not found");
    }
  }

  /**
   * Returns the course's join-link token, minting one on first request (D2:
   * one static token per course). A course that already has a token gets
   * back that same value — this never rotates an existing link.
   * @param courseId - The course to get or create a join link for.
   * @throws If the course does not exist.
   */
  async getOrCreateInviteToken(courseId: string): Promise<string> {
    const course = await this.courses.findOne({
      id: courseId,
      schoolId: this.schoolId,
    });
    if (!course) {
      throw new Error("Course not found");
    }
    if (course.inviteToken) {
      return course.inviteToken;
    }

    const token = crypto.randomUUID();
    await this.courses.updateOne(
      { id: courseId },
      { $set: { inviteToken: token } },
    );
    return token;
  }

  /**
   * Replaces a course's join-link token with a brand new one, discarding
   * whatever was there before — the previous link stops resolving to this
   * course immediately. Safe to call even if no token existed yet.
   * @param courseId - The course to issue a fresh join link for.
   * @throws If the course does not exist.
   */
  async regenerateInviteToken(courseId: string): Promise<string> {
    const token = crypto.randomUUID();
    const result = await this.courses.updateOne(
      { id: courseId, schoolId: this.schoolId },
      { $set: { inviteToken: token } },
    );
    if (result.matchedCount === 0) {
      throw new Error("Course not found");
    }
    return token;
  }

  /**
   * Switches a course's join link off. Clearing back to `null` is
   * indistinguishable from "never minted" — the next request for a link
   * mints a fresh one (D2/D6: no separate enabled/disabled flag exists).
   * @param courseId - The course to switch the join link off for.
   * @throws If the course does not exist.
   */
  async disableInviteToken(courseId: string): Promise<void> {
    const result = await this.courses.updateOne(
      { id: courseId, schoolId: this.schoolId },
      { $set: { inviteToken: null } },
    );
    if (result.matchedCount === 0) {
      throw new Error("Course not found");
    }
  }
}
