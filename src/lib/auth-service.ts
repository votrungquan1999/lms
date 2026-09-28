import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { type Db, ObjectId } from "mongodb";
import { readActiveSchoolCookie } from "./active-school-cookie";
import type { AppConfig } from "./config";
import type { SchoolService, UserSchool } from "./school-service";
import {
  AdminSession,
  isSchoolAdminSession,
  Role,
  type SchoolAdminSession,
  type Session,
  StudentSession,
} from "./session";
import type { StudentService } from "./student-service";

/**
 * What a login page should show for the current caller (BUG-4): a genuinely
 * signed-out visitor, someone already classified as admin or student, or
 * someone holding a valid Better Auth cookie whose session resolves to no
 * usable role — the state a non-invite Google sign-in now commonly produces.
 */
export enum LoginEntryState {
  SignedOut = "signed-out",
  Admin = "admin",
  Student = "student",
  Unclassified = "unclassified",
}

/**
 * Input for registering a student (auth signup + domain doc).
 */
interface RegisterStudentInput {
  name: string;
  username: string;
  password: string;
  createdBy: string;
  /** The school the new student belongs to. */
  schoolId: string;
}

/**
 * The raw Better Auth identity fields needed to provision a Google signup as
 * a student — never a full `Session`, since this caller is by definition not
 * yet classified as one.
 */
export interface UnclassifiedIdentity {
  authUserId: string;
  email: string;
  name: string;
}

/**
 * A signed-in admin who is not the platform owner. Typed so owner-only
 * actions can log who tried, unlike a caller with no admin session at all.
 */
export class OwnerRequiredError extends Error {
  constructor(readonly userId: string) {
    super("Unauthorized: owner access required");
    this.name = "OwnerRequiredError";
  }
}

/**
 * Creates the Better Auth instance with our standard config.
 * Extracted so TypeScript can infer the specific return type.
 */
function createBetterAuth(db: Db, config: AppConfig) {
  return betterAuth({
    database: mongodbAdapter(db),
    emailAndPassword: { enabled: true },
    basePath: "/api/auth",
    secret: config.authSecret,
    baseURL: {
      allowedHosts: config.authAllowedHosts,
    },
    trustedOrigins: config.trustedOrigins,
    socialProviders: {
      google: {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
      },
    },
    user: {
      additionalFields: {
        // input:false is mandatory — it defaults to true, which would let a
        // signup body set its own role and re-open the escalation this closes.
        role: {
          type: "string",
          required: false,
          input: false,
          defaultValue: Role.Student,
        },
      },
    },
  });
}

/**
 * Narrows the user document's raw `role` field to whether it records admin
 * access. A stale or hand-edited value that isn't exactly "admin" must never
 * resolve to admin.
 */
function isRecordedAdmin(role: unknown): boolean {
  return role === Role.Admin;
}

/**
 * Derives the synthetic Better Auth email for a username. `username` MUST
 * already be lowercased by the caller — this only concatenates, it does not
 * normalize, so `findByUsername` (case-sensitive) and this derived address
 * stay in agreement.
 */
function toInternalEmail(username: string): string {
  return `${username}@lms.internal`;
}

/** The `user` shape Better Auth's `getSession()` resolves to. */
type BetterAuthSessionUser = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createBetterAuth>["api"]["getSession"]>>
>["user"];

/**
 * The active-school chain: the only membership; else the cookie's school
 * if the admin still belongs to it; else the first school by name. Mongo's
 * default sort is case-sensitive, so the name sort runs here in app code
 * instead of a query-level `.sort()` — the admin's own membership list is
 * always small enough for this to be cheap.
 */
function resolveActiveSchool(
  schools: UserSchool[],
  cookieSchoolId: string | undefined,
): UserSchool | null {
  if (schools.length === 1) {
    return schools[0];
  }
  if (schools.length === 0) {
    return null;
  }

  // The cookie value is only ever compared against the admin's own
  // memberships, never used in a query — a tampered or revoked id just
  // fails to match and falls through to the name-sorted default below.
  const cookieMatch = cookieSchoolId
    ? schools.find((school) => school.id === cookieSchoolId)
    : undefined;
  if (cookieMatch) {
    return cookieMatch;
  }

  const sortedByName = [...schools].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });
  return sortedByName[0];
}

/** AuthService's collaborators, named so adding one never shifts every call site. */
export interface AuthServiceDeps {
  studentService: StudentService;
  schoolService: SchoolService;
}

/**
 * AuthService — our app's abstraction layer over Better Auth.
 *
 * Better Auth handles ONLY authentication (credentials + sessions).
 * Domain data (username, name) lives in our own collections. `role` is the
 * exception: it is recorded on the Better Auth user document itself, via
 * `additionalFields` with `input: false` so a request body can never set it.
 */
export class AuthService {
  /** Better Auth instance, exposed for API route handler. */
  readonly auth: ReturnType<typeof createBetterAuth>;

  private readonly studentService: StudentService;
  private readonly schoolService: SchoolService;
  private readonly adminEmails: string[];

  constructor(
    readonly db: Db,
    readonly config: AppConfig,
    deps: AuthServiceDeps,
  ) {
    this.auth = createBetterAuth(db, config);
    this.studentService = deps.studentService;
    this.schoolService = deps.schoolService;
    this.adminEmails = config.adminEmails;
  }

  /**
   * Registers a student account.
   * 1. Creates a Better Auth user (email/password for auth only)
   * 2. Delegates student document creation to StudentService
   */
  async registerStudent(input: RegisterStudentInput) {
    // Rejected before any write: a password of only spaces would pass
    // better-auth's own length check but could never be typed back in,
    // since sign-in treats a spaces-only entry as blank.
    if (input.password.trim() === "") {
      throw new Error("Password cannot be only spaces");
    }

    // Lowercased BEFORE both the lookup and the email derivation: better-auth
    // always lowercases the email it stores (`email.toLowerCase()`), but our
    // own `findByUsername` is a case-sensitive exact match. Left disagreeing,
    // a signup as "Alice" against an existing "alice" slips past this guard
    // and then collides inside better-auth instead, surfacing its raw
    // "User already exists" error on a form with no email field.
    const username = input.username.toLowerCase();

    const existing = await this.studentService.findByUsername(username);
    if (existing) {
      throw new Error("Username already exists");
    }

    const authResult = await this.auth.api.signUpEmail({
      body: {
        email: toInternalEmail(username),
        password: input.password,
        name: input.name,
      },
    });

    let student: Awaited<ReturnType<StudentService["createStudentDocument"]>>;
    try {
      student = await this.studentService.createStudentDocument({
        authUserId: authResult.user.id,
        username,
        name: input.name,
        createdBy: input.createdBy,
        schoolId: input.schoolId,
      });
    } catch (error) {
      await this.rollbackAuthUser(authResult.user.id);
      throw error;
    }

    return {
      id: student.id,
      username: student.username,
      name: student.name,
    };
  }

  /**
   * Deletes a Better Auth user and its account/session rows. `registerStudent`'s
   * rollback (BUG-3) is the remaining caller. All three key off the same raw
   * ObjectId (user._id / account+session userId) — the string `id` field
   * never appears as-is in these documents.
   * Deleted session-first: these three writes are sequential and non-
   * transactional, so a mid-way failure must never leave a live session row
   * pointing at an already-deleted user. Deleting `session` last would do
   * exactly that.
   */
  async rollbackAuthUser(authUserId: string): Promise<void> {
    const rawUserId = new ObjectId(authUserId);
    await this.db.collection("session").deleteMany({ userId: rawUserId });
    await this.db.collection("account").deleteMany({ userId: rawUserId });
    await this.db.collection("user").deleteOne({ _id: rawUserId });
  }

  /**
   * Signs in a student with username and password.
   * 1. Looks up student by username in our collection
   * 2. Resolves the internal email
   * 3. Signs in via Better Auth
   */
  async signInStudent(input: { username: string; password: string }) {
    const student = await this.studentService.findByUsername(input.username);
    if (!student) {
      throw new Error("Invalid username or password");
    }

    return this.auth.api.signInEmail({
      body: {
        email: toInternalEmail(input.username),
        password: input.password,
      },
    });
  }

  /**
   * Tier-2 owner check (D23) — is this email in ADMIN_EMAILS? Gates only who
   * may grant/revoke the admin role, never day-to-day admin access, which is
   * `user.role`. Async so its type forces callers to `await` — every method
   * on the traced singleton returns a Promise at runtime (see
   * traced-service.ts), so a sync signature here would silently resolve
   * truthy for every email once called through that singleton.
   */
  async isAdminEmail(email: string): Promise<boolean> {
    return this.adminEmails.includes(email);
  }

  /**
   * Classifies a Better Auth user into a Session (or null). The one place
   * that walks admin -> student -> unclassified — getSession() and
   * resolveLoginEntryState() both call it so the dashboard guard's admission
   * decision and the login page's redirect target can never diverge; the
   * cascade used to be hand-copied in both methods, which is exactly the
   * coupling that let BUG-4 (an authenticated caller looping back to login)
   * happen in the first place.
   */
  private async classify(
    user: BetterAuthSessionUser,
    headers: Headers,
  ): Promise<Session | null> {
    // Admin-ness is a recorded fact on the user, never an email-string match.
    if (isRecordedAdmin(user.role)) {
      // Read fresh on every call — never cached — so a revoked membership
      // or a newly added one is honored on the very next request.
      const schools = await this.schoolService.listSchoolsForUser(user.id);
      const school = resolveActiveSchool(
        schools,
        readActiveSchoolCookie(headers),
      );
      return new AdminSession({ userId: user.id, email: user.email, school });
    }

    const student = await this.studentService.findByAuthUserId(user.id);
    // A student not yet assigned to a school gets no session (fail closed).
    if (student?.schoolId) {
      return new StudentSession({
        userId: user.id,
        username: student.username,
        studentId: student.id,
        schoolId: student.schoolId,
      });
    }

    return null;
  }

  /**
   * Retrieves the current session from request headers.
   * Returns a typed AdminSession or StudentSession, or null if not authenticated.
   */
  async getSession(headers: Headers): Promise<Session | null> {
    // Next's `headers()` returns a read-only Headers subclass that better-auth's
    // session lookup silently fails against (always resolves no session) —
    // rebuilding a plain, writable Headers with the same entries fixes it.
    const plainHeaders = new Headers(Object.fromEntries(headers.entries()));
    const betterAuthSession = await this.auth.api.getSession({
      headers: plainHeaders,
    });
    if (!betterAuthSession) {
      return null;
    }

    return this.classify(betterAuthSession.user, plainHeaders);
  }

  /**
   * Resolves what a login page should show for the caller — shared by both
   * login pages so the routing logic exists in one place, not two hand-rolled
   * copies (§5/BUG-4). Distinguishes "no Better Auth cookie at all" from
   * "a valid cookie whose session resolves to no usable role" — the two
   * `null`-shaped outcomes `getSession()` collapses together, which is
   * exactly what let a dead cookie loop the caller back to a do-nothing form.
   */
  async resolveLoginEntryState(headers: Headers): Promise<LoginEntryState> {
    const betterAuthSession = await this.auth.api.getSession({ headers });
    if (!betterAuthSession) {
      return LoginEntryState.SignedOut;
    }

    const session = await this.classify(betterAuthSession.user, headers);
    if (session instanceof AdminSession) {
      return LoginEntryState.Admin;
    }
    if (session instanceof StudentSession) {
      return LoginEntryState.Student;
    }

    return LoginEntryState.Unclassified;
  }

  /**
   * Resolves the caller's raw Better Auth identity — but ONLY when they hold
   * a valid session that classifies as unclassified. A signed-out visitor or
   * an already-admin/already-student caller gets `null`. Nothing here checks
   * OAuth origin or provider — it is driven by email/password sessions too
   * (see this file's own test suite) — so it is not an "invite-origin
   * guard" by itself; the closest thing to one is the `?google=1` consent
   * marker `/join/[token]`'s page checks before calling this at all (D19's
   * named fallback, open question 3, M1). What this method DOES guarantee is
   * that an already-classified caller — a recorded admin or student, however
   * they signed in — never gets an identity back, which is what keeps an
   * administrator's Google sign-in from ever being handed a student document
   * (Step 24).
   */
  async resolveUnclassifiedIdentity(
    headers: Headers,
  ): Promise<UnclassifiedIdentity | null> {
    const betterAuthSession = await this.auth.api.getSession({ headers });
    if (!betterAuthSession) {
      return null;
    }

    const session = await this.classify(betterAuthSession.user, headers);
    if (session) {
      return null;
    }

    return {
      authUserId: betterAuthSession.user.id,
      email: betterAuthSession.user.email,
      name: betterAuthSession.user.name,
    };
  }

  /**
   * Requires the current session to be a school-scoped admin: a recorded
   * admin AND an active school. Fails closed on a missing school — a
   * zero-membership admin can never reach a school action, even one that
   * forgets its own school check. `requireOwnerSession` (below) does NOT
   * delegate here: the owner has no school membership of their own and must
   * still be able to create the first school.
   */
  async requireAdminSession(headers: Headers): Promise<SchoolAdminSession> {
    const session = await this.getSession(headers);
    if (!session || session.role !== Role.Admin) {
      throw new Error("Unauthorized: admin access required");
    }
    const adminSession = session as AdminSession;
    if (!isSchoolAdminSession(adminSession)) {
      throw new Error("Unauthorized: not part of any school yet");
    }
    return adminSession;
  }

  /**
   * Requires the current session to be the platform OWNER: a
   * recorded admin AND an ADMIN_EMAILS address. Its own Tier-1 admin check
   * — schools and school admins are granted before any school exists to
   * create them in, so this must succeed for a zero-membership owner even
   * though `requireAdminSession` above now fails closed without one.
   */
  async requireOwnerSession(headers: Headers): Promise<AdminSession> {
    const session = await this.getSession(headers);
    if (!session || session.role !== Role.Admin) {
      throw new Error("Unauthorized: admin access required");
    }
    const adminSession = session as AdminSession;
    const isOwner = await this.isAdminEmail(adminSession.email);
    if (!isOwner) {
      throw new OwnerRequiredError(adminSession.userId);
    }
    return adminSession;
  }

  /**
   * Requires the current session to be a student.
   * Throws if not authenticated or not a student.
   */
  async requireStudentSession(headers: Headers): Promise<StudentSession> {
    const session = await this.getSession(headers);
    if (!session || session.role !== Role.Student) {
      throw new Error("Unauthorized: student access required");
    }
    return session as StudentSession;
  }
}

/**
 * Creates an AuthService instance from config and its dependencies.
 */
export function createAuthService(
  db: Db,
  config: AppConfig,
  deps: AuthServiceDeps,
): AuthService {
  return new AuthService(db, config, deps);
}
