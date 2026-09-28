import type { Db } from "mongodb";
import type { AuthServiceDeps } from "src/lib/auth-service";
import { SchoolDirectory } from "src/lib/school-directory";
import { SchoolService } from "src/lib/school-service";
import { StudentService } from "src/lib/student-service";

/**
 * AuthService's real collaborators against a test database, wired like
 * `auth-singleton.ts`: a student service for whichever school a
 * registration names.
 * @param db - The test database.
 */
export function realAuthServiceDeps(db: Db): AuthServiceDeps {
  return {
    getStudentService: async (schoolId) => new StudentService(db, schoolId),
    schoolDirectory: new SchoolDirectory(db),
    schoolService: new SchoolService(db),
  };
}
