import type { Collection, Db } from "mongodb";

/** School document stored in the `school` collection. */
export interface SchoolDocument {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  createdBy: string;
}

/** Client-facing school. */
export interface School {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  createdBy: string;
}

/**
 * SchoolService — the one platform-level service owning the `school`
 * collection (tenants) and, from step 2, `school_membership` (D19).
 */
export class SchoolService {
  private readonly schools: Collection<SchoolDocument>;

  constructor(db: Db) {
    this.schools = db.collection<SchoolDocument>("school");
  }

  /**
   * Creates a new school. Throws the raw duplicate-key error on a slug
   * clash — callers map it to a friendly refusal.
   * @param input - The owner-entered name and slug, plus who created it.
   */
  async createSchool(input: {
    name: string;
    slug: string;
    createdBy: string;
  }): Promise<School> {
    const doc: SchoolDocument = {
      id: crypto.randomUUID(),
      name: input.name,
      slug: input.slug,
      createdAt: new Date(),
      createdBy: input.createdBy,
    };
    await this.schools.insertOne(doc);
    return this.toSchool(doc);
  }

  /** Lists every school on the platform. */
  async listSchools(): Promise<School[]> {
    const docs = await this.schools.find({}).toArray();
    return docs.map((doc) => this.toSchool(doc));
  }

  /**
   * Looks up one school by id.
   * @param id - The school's id.
   */
  async getSchool(id: string): Promise<School | null> {
    const doc = await this.schools.findOne({ id });
    return doc ? this.toSchool(doc) : null;
  }

  private toSchool(doc: SchoolDocument): School {
    return {
      id: doc.id,
      name: doc.name,
      slug: doc.slug,
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
    };
  }
}
