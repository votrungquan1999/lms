import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import type { Db } from "mongodb";
import type { AppConfig } from "./config";
import { AdminSession, type Session, StudentSession } from "./session";
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
    trustedOrigins: config.trustedOrigins,
    socialProviders: {
      google: {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
      },
    },
  });
}

/**
 * AuthService — our app's abstraction layer over Better Auth.
 *
 * Better Auth handles ONLY authentication (credentials + sessions).
 * All domain data (username, name, role) lives in our own collections,
 * completely decoupled from Better Auth's schema.
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
      // Rollback: remove the orphaned Better Auth user to keep state consistent
      await this.db.collection("user").deleteOne({ id: authResult.user.id });
      throw error;
    }

    return {
      id: student.id,
      username: student.username,
      name: student.name,
      role: "student" as const,
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
   * Checks if an email is recognized as an admin.
   */
  isAdminEmail(email: string): boolean {
    return this.adminEmails.includes(email);
  }

  /**
   * Retrieves the current session from request headers.
   * Returns a typed AdminSession or StudentSession, or null if not authenticated.
   */
  async getSession(headers: Headers): Promise<Session | null> {
    const betterAuthSession = await this.auth.api.getSession({ headers });
    if (!betterAuthSession) {
      return null;
    }

    const { user } = betterAuthSession;
    const email = user.email;

    // Check if admin
    if (this.isAdminEmail(email)) {
      return new AdminSession({ userId: user.id, email });
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
    if (!session || session.role !== "admin") {
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
    if (!session || session.role !== "student") {
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
