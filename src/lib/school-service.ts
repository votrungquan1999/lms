import { type Collection, type Db, ObjectId } from "mongodb";
import { cache } from "react";

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
 * Membership document stored in the `school_membership` collection — one
 * user's admin access to one school. Unique on {schoolId, userId}.
 */
export interface SchoolMembershipDocument {
  id: string;
  schoolId: string;
  userId: string;
  createdAt: Date;
  createdBy: string;
}

/** One school a user belongs to, as `listSchoolsForUser` returns it. */
export interface UserSchool {
  id: string;
  name: string;
}

/**
 * SchoolService — the one platform-level service owning the `school`
 * collection (tenants) and `school_membership`.
 */
export class SchoolService {
  private readonly schools: Collection<SchoolDocument>;
  private readonly memberships: Collection<SchoolMembershipDocument>;

  /** One lookup per user per server render; see `listSchoolsForRequest`. */
  private readonly schoolsForRequest = cache((userId: string) =>
    this.listSchoolsForUser(userId),
  );

  // Keyed by a joined string: `cache` compares arguments by identity, so an
  // array would never hit.
  private readonly schoolsForStudent = cache(async (key: string) => {
    if (key === "") {
      return [];
    }
    const docs = await this.schools
      .find({ id: { $in: key.split(",") } })
      .toArray();
    return docs.map((doc) => ({ id: doc.id, name: doc.name }));
  });

  constructor(private readonly db: Db) {
    this.schools = db.collection<SchoolDocument>("school");
    this.memberships =
      db.collection<SchoolMembershipDocument>("school_membership");
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

  /**
   * Finds a school by slug, or creates it. `$setOnInsert` means a rerun
   * with a different name never changes an existing school's name or id —
   * used by seed scripts and the backfill, which must never fight the
   * owner's own naming.
   */
  async ensureSchoolBySlug(input: {
    slug: string;
    name: string;
    createdBy: string;
  }): Promise<School> {
    await this.schools.updateOne(
      { slug: input.slug },
      {
        $setOnInsert: {
          id: crypto.randomUUID(),
          name: input.name,
          slug: input.slug,
          createdAt: new Date(),
          createdBy: input.createdBy,
        },
      },
      { upsert: true },
    );
    const doc = await this.schools.findOne({ slug: input.slug });
    if (!doc) {
      throw new Error(
        `ensureSchoolBySlug: no school found for slug "${input.slug}" after upsert`,
      );
    }
    return this.toSchool(doc);
  }

  /**
   * Adds a membership — the given user becomes a school admin of the given
   * school. Stamps `schoolAccessManagedAt` on the user, so the backfill
   * never re-grants an account whose access was managed by hand.
   * Throws the raw duplicate-key error on a repeat add — callers map it to
   * a friendly refusal.
   * @param schoolId - The school to grant access to.
   * @param userId - The hex user id (better-auth's `user._id.toHexString()`).
   * @param createdBy - Who granted it.
   */
  async addMembership(
    schoolId: string,
    userId: string,
    createdBy: string,
  ): Promise<void> {
    const doc: SchoolMembershipDocument = {
      id: crypto.randomUUID(),
      schoolId,
      userId,
      createdAt: new Date(),
      createdBy,
    };
    await this.memberships.insertOne(doc);
    await this.stampAccessManaged(userId);
  }

  /**
   * Removes a membership. The role itself is left untouched — only
   * `deleteMembershipsForUser` (revoke) removes every school at once.
   * Returns false, and writes nothing, when there was no such membership.
   * @param schoolId - The school to remove access from.
   * @param userId - The hex user id.
   */
  async removeMembership(schoolId: string, userId: string): Promise<boolean> {
    const result = await this.memberships.deleteOne({ schoolId, userId });
    if (result.deletedCount === 0) {
      return false;
    }
    await this.stampAccessManaged(userId);
    return true;
  }

  /**
   * Deletes every membership for a user — called when their admin role is
   * revoked, so a later re-grant restores only the school it names.
   * @param userId - The hex user id.
   */
  async deleteMembershipsForUser(userId: string): Promise<void> {
    await this.memberships.deleteMany({ userId });
  }

  /**
   * Lists the user ids with a membership in a school — the schools
   * console's admin roster.
   * @param schoolId - The school.
   */
  async listMembershipsForSchool(schoolId: string): Promise<string[]> {
    const docs = await this.memberships.find({ schoolId }).toArray();
    return docs.map((doc) => doc.userId);
  }

  /**
   * Reports whether a user holds any membership row, counting one whose
   * school was deleted.
   * @param userId - The hex user id.
   */
  async hasAnyMembership(userId: string): Promise<boolean> {
    return (
      (await this.memberships.countDocuments({ userId }, { limit: 1 })) > 0
    );
  }

  /**
   * Lists the schools a user belongs to, `{id, name}` only — what the
   * active-school resolution and the switcher need.
   * @param userId - The hex user id.
   */
  async listSchoolsForUser(userId: string): Promise<UserSchool[]> {
    const memberships = await this.memberships.find({ userId }).toArray();
    if (memberships.length === 0) {
      return [];
    }
    const schoolIds = memberships.map((m) => m.schoolId);
    const docs = await this.schools.find({ id: { $in: schoolIds } }).toArray();
    return docs.map((doc) => ({ id: doc.id, name: doc.name }));
  }

  /**
   * Lists the given schools by id, `{id, name}` only. A deleted school is
   * simply absent from the result.
   * @param schoolIds - The school ids from a student's record.
   */
  async listSchoolsForStudent(schoolIds: string[]): Promise<UserSchool[]> {
    return this.schoolsForStudent([...schoolIds].sort().join(","));
  }

  /**
   * `listSchoolsForUser`, memoized for the current server render so the
   * session lookup, layout, page and breadcrumb slots share one read. The
   * memo dies with the request, so a revoked membership still takes effect
   * on the next one.
   * @param userId - The hex user id.
   */
  async listSchoolsForRequest(userId: string): Promise<UserSchool[]> {
    return this.schoolsForRequest(userId);
  }

  /** Stamps `schoolAccessManagedAt` on the user this membership change targets. */
  private async stampAccessManaged(userId: string): Promise<void> {
    await this.db
      .collection("user")
      .updateOne(
        { _id: new ObjectId(userId) },
        { $set: { schoolAccessManagedAt: new Date() } },
      );
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
