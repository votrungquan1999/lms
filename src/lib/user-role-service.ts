import type { Db, ObjectId } from "mongodb";
import { Role } from "./session";

/** Raw better-auth `user` collection shape this service reads and writes. */
interface UserDocument {
  _id: ObjectId;
  email: string;
  name: string;
  role?: string;
}

/** One person who can sign in, and the access they currently hold. */
export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * A page of `listUsers()` results plus enough context to tell the operator
 * when the list was truncated, rather than silently showing a partial view.
 */
export interface ManagedUserList {
  users: ManagedUser[];
  totalCount: number;
  limit: number;
}

/** Bound on `listUsers()` — this collection is dominated by students and has
 * no index on `email`; an unbounded sort risks a slow or failing query on a
 * large table. */
const USER_LIST_LIMIT = 100;

/**
 * UserRoleService — the only code path (besides `AuthService.getSession()`)
 * that reads or writes `role` on the better-auth `user` collection. The
 * role-management page and its server action go through this rather than
 * touching the raw collection themselves (D26).
 */
export class UserRoleService {
  constructor(private readonly db: Db) {}

  /**
   * Lists up to `USER_LIST_LIMIT` accounts, alphabetically by email, with
   * their current role. A document with no `role` key reads as Student —
   * the same default `AuthService.getSession()` and the schema's own
   * `defaultValue` apply. Also reports the true total so the caller can
   * tell the operator when the list was truncated.
   */
  async listUsers(): Promise<ManagedUserList> {
    const collection = this.db.collection<UserDocument>("user");
    const [docs, totalCount] = await Promise.all([
      collection.find({}).sort({ email: 1 }).limit(USER_LIST_LIMIT).toArray(),
      collection.countDocuments(),
    ]);

    return {
      users: docs.map((doc) => ({
        id: doc._id.toString(),
        email: doc.email,
        name: doc.name,
        role: doc.role === Role.Admin ? Role.Admin : Role.Student,
      })),
      totalCount,
      limit: USER_LIST_LIMIT,
    };
  }
}
