import type { Collection, Db } from "mongodb";

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
}

/**
 * Client-facing course interface.
 */
export interface Course {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
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
 * CourseService — manages the `course` collection.
 */
export class CourseService {
  private readonly courses: Collection<CourseDocument>;

  constructor(db: Db) {
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
    };

    await this.courses.insertOne(doc);

    return {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
    };
  }

  async getCourse(courseId: string): Promise<Course | null> {
    const doc = await this.courses.findOne({ id: courseId });
    if (!doc) {
      return null;
    }
    return {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
    };
  }

  async getCoursesByIds(courseIds: string[]): Promise<Course[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const docs = await this.courses
      .find({ id: { $in: courseIds } })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
    }));
  }

  async listCourses(): Promise<Course[]> {
    const docs = await this.courses.find({}).sort({ createdAt: -1 }).toArray();

    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
    }));
  }
}
