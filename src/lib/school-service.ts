import { type Collection, type Db, ObjectId } from "mongodb";

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
