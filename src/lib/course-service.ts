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
 * CourseService — manages the `course` collection.
 */
export class CourseService {
  private readonly courses: Collection<CourseDocument>;

  constructor(db: Db) {
    this.courses = db.collection<CourseDocument>("course");
  }

  /**
   * Maps a stored course document to the client-facing course, surfacing
   * materials with an empty `url` placeholder (minted at render time).
   * @param doc - The stored course document.
   * @returns The client-facing course.
   */
  private toCourse(doc: CourseDocument): Course {
    return {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
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
    };

    await this.courses.insertOne(doc);

    return this.toCourse(doc);
  }

  async getCourse(courseId: string): Promise<Course | null> {
    const doc = await this.courses.findOne({ id: courseId });
    if (!doc) {
      return null;
    }
    return this.toCourse(doc);
  }

  async getCoursesByIds(courseIds: string[]): Promise<Course[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const docs = await this.courses
      .find({ id: { $in: courseIds } })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => this.toCourse(doc));
  }

  async listCourses(): Promise<Course[]> {
    const docs = await this.courses.find({}).sort({ createdAt: -1 }).toArray();

    return docs.map((doc) => this.toCourse(doc));
  }

  /**
   * Adds a downloadable material to a course, appending it after any existing
   * materials. The `order` is derived from the current material count.
   * @param courseId - The course to attach the material to.
   * @param input - The material metadata (S3 key, content type, name, size).
   */
  async addCourseMaterial(
    courseId: string,
    input: AddCourseMaterialInput,
  ): Promise<void> {
    const course = await this.courses.findOne({ id: courseId });
    if (!course) {
      return;
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
   * Removes a material from a course by its S3 key. No-op when the course or
   * key is unknown (`$pull` matches nothing).
   * @param courseId - The course to remove the material from.
   * @param materialKey - The S3 key of the material to remove.
   */
  async removeCourseMaterial(
    courseId: string,
    materialKey: string,
  ): Promise<void> {
    await this.courses.updateOne(
      { id: courseId },
      { $pull: { materials: { key: materialKey } } },
    );
  }
}
