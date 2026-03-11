import { AuthService } from "./auth-service";
import { loadConfig } from "./config";
import { getDatabase } from "./database";
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
  const studentService = new StudentService(db);
  authService = new AuthService(db, config, studentService);

  return authService;
}
