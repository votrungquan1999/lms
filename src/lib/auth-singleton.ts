import { AuthService } from "./auth-service";
import { loadConfig } from "./config";
import { getDatabase } from "./database";
import { tracedService } from "./observability/traced-service";
import { SchoolDirectory } from "./school-directory";
import { SchoolService } from "./school-service";
import { StudentService } from "./student-service";

/**
 * Lazy singleton for AuthService.
 * Uses the shared database connection from database.ts.
 */

let authService: AuthService | null = null;

export async function getAuthService(): Promise<AuthService> {
  if (authService) {
    return authService;
  }

  const config = loadConfig();
  const db = await getDatabase();
  const schoolService = new SchoolService(db);
  const schoolDirectory = new SchoolDirectory(db);
  authService = tracedService(
    new AuthService(db, config, {
      // Built per registration here rather than taken from
      // services-singleton, which already imports this module.
      getStudentService: async (schoolId) => new StudentService(db, schoolId),
      schoolDirectory,
      schoolService,
    }),
    "auth",
  );

  return authService;
}
