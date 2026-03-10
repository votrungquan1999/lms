import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import type { Collection, Db } from "mongodb";
import type { AppConfig } from "./config";
import { AdminSession, type Session, StudentSession } from "./session";

/**
 * Input for creating a new student account.
 */
interface CreateStudentInput {
  name: string;
  username: string;
  password: string;
}

/**
 * Student document stored in our `student` collection.
 */
interface StudentDocument {
  /** Our domain ID. */
  id: string;
  /** Foreign key to Better Auth's user table. */
  authUserId: string;
  /** Student's login username. */
  username: string;
  /** Student's display name. */
  name: string;
  /** Role in the LMS system. */
  role: "student";
  /** Timestamp of creation. */
  createdAt: Date;
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

  private readonly students: Collection<StudentDocument>;
  private readonly adminEmails: string[];

  constructor(
    readonly db: Db,
    readonly config: AppConfig,
  ) {
    this.auth = createBetterAuth(db, config);
    this.students = db.collection<StudentDocument>("student");
    this.adminEmails = config.adminEmails;
  }

  /**
   * Creates a student account.
   * 1. Creates a Better Auth user (email/password for auth only)
   * 2. Creates a student document in our collection (domain data)
   */
  async createStudent(input: CreateStudentInput) {
    const existing = await this.students.findOne({ username: input.username });
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

    const studentDoc: StudentDocument = {
      id: crypto.randomUUID(),
      authUserId: authResult.user.id,
      username: input.username,
      name: input.name,
      role: "student",
      createdAt: new Date(),
    };

    await this.students.insertOne(studentDoc);

    return {
      id: studentDoc.id,
      username: studentDoc.username,
      name: studentDoc.name,
      role: studentDoc.role,
    };
  }

  /**
   * Signs in a student with username and password.
   * 1. Looks up student by username in our collection
   * 2. Resolves the internal email
   * 3. Signs in via Better Auth
   */
  async signInStudent(input: { username: string; password: string }) {
    const student = await this.students.findOne({ username: input.username });
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
    const student = await this.students.findOne({ authUserId: user.id });
    if (student) {
      return new StudentSession({
        userId: user.id,
        username: student.username,
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
}

/**
 * Creates an AuthService instance from config.
 */
export function createAuthService(db: Db, config: AppConfig): AuthService {
  return new AuthService(db, config);
}
