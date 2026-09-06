import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { type Db, ObjectId } from "mongodb";
import type { AppConfig } from "./config";
import { AdminSession, Role, type Session, StudentSession } from "./session";
import type { StudentService } from "./student-service";

/**
 * Input for registering a student (auth signup + domain doc).
 */
interface RegisterStudentInput {
  name: string;
  username: string;
  password: string;
  createdBy: string;
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
  private readonly adminEmails: string[];

  constructor(
    readonly db: Db,
    readonly config: AppConfig,
    studentService: StudentService,
  ) {
    this.auth = createBetterAuth(db, config);
    this.studentService = studentService;
    this.adminEmails = config.adminEmails;
  }

  /**
   * Registers a student account.
   * 1. Creates a Better Auth user (email/password for auth only)
   * 2. Delegates student document creation to StudentService
   */
  async registerStudent(input: RegisterStudentInput) {
    const existing = await this.studentService.findByUsername(input.username);
    if (existing) {
      throw new Error("Username already exists");
    }

    const authResult = await this.auth.api.signUpEmail({
      body: {
        email: `${input.username}@lms.internal`,
        password: input.password,
        name: input.name,
      },
    });

    let student: Awaited<ReturnType<StudentService["createStudentDocument"]>>;
    try {
      student = await this.studentService.createStudentDocument({
        authUserId: authResult.user.id,
        username: input.username,
        name: input.name,
        createdBy: input.createdBy,
      });
    } catch (error) {
      // Rollback: signUpEmail wrote a user, an account (password hash), and
      // a session — remove all three to keep no orphaned auth state behind.
      // All three key off the same raw ObjectId (user._id / account+session
      // userId) — the string `id` field never appears as-is in these documents.
      const rawUserId = new ObjectId(authResult.user.id);
      await this.db.collection("user").deleteOne({ _id: rawUserId });
      await this.db.collection("account").deleteMany({ userId: rawUserId });
      await this.db.collection("session").deleteMany({ userId: rawUserId });
      throw error;
    }

    return {
      id: student.id,
      username: student.username,
      name: student.name,
    };
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
        email: `${input.username}@lms.internal`,
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

    const { user } = betterAuthSession;

    // Admin-ness is a recorded fact on the user, never an email-string match.
    if (isRecordedAdmin(user.role)) {
      return new AdminSession({ userId: user.id, email: user.email });
    }

    // Check if student
    const student = await this.studentService.findByAuthUserId(user.id);
    if (student) {
      return new StudentSession({
        userId: user.id,
        username: student.username,
        studentId: student.id,
      });
    }

    return null;
  }

  /**
   * Requires the current session to be an admin.
   * Throws if not authenticated or not an admin.
   */
  async requireAdminSession(headers: Headers): Promise<AdminSession> {
    const session = await this.getSession(headers);
    if (!session || session.role !== Role.Admin) {
      throw new Error("Unauthorized: admin access required");
    }
    return session as AdminSession;
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
 * Creates an AuthService instance from config and student service.
 */
export function createAuthService(
  db: Db,
  config: AppConfig,
  studentService: StudentService,
): AuthService {
  return new AuthService(db, config, studentService);
}
