/**
 * Gives a spec its own school so counts, badges and empty states are not
 * polluted by the shared "e2e" school's leftovers from other specs.
 */
import type { Browser, BrowserContext } from "@playwright/test";
import type { Db } from "mongodb";
import { SchoolService } from "../src/lib/school-service";
import { ADMIN_EMAIL } from "./admin-account";
import { withDb } from "./seed";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const ACTIVE_SCHOOL_COOKIE = "lms_active_school";

export interface OwnSchool {
  schoolId: string;
  name: string;
  /** An admin browser context whose active school is this one. */
  context: BrowserContext;
  /** Drops the admin's membership and closes the context. */
  remove: () => Promise<void>;
}

/** The admin's user id, looked up by the shared e2e admin email. */
async function adminUserId(db: Db): Promise<string> {
  const user = await db.collection("user").findOne({ email: ADMIN_EMAIL });
  if (!user) throw new Error(`No user document for ${ADMIN_EMAIL}`);
  return user._id.toHexString();
}

/**
 * Creates (or reuses) a school the admin belongs to and returns a context
 * with it active. The name sorts after "E2E School", so other contexts keep
 * the shared school as their default. A leftover membership from a spec that
 * died before `remove` is dropped first.
 */
export async function createOwnSchool(
  browser: Browser,
  slug: string,
): Promise<OwnSchool> {
  const name = `Zz ${slug} school`;
  const { schoolId, userId } = await withDb(async (db) => {
    const schoolService = new SchoolService(db);
    const school = await schoolService.ensureSchoolBySlug({
      slug,
      name,
      createdBy: "e2e-own-school",
    });
    const userId = await adminUserId(db);
    await schoolService.removeMembership(school.id, userId);
    await schoolService.addMembership(school.id, userId, "e2e-own-school");
    return { schoolId: school.id, userId };
  });

  const context = await browser.newContext({
    storageState: "playwright/.auth/admin.json",
  });
  await context.addCookies([
    { name: ACTIVE_SCHOOL_COOKIE, value: schoolId, url: BASE_URL },
  ]);

  return {
    schoolId,
    name,
    context,
    remove: async () => {
      await context.close();
      await withDb(async (db) => {
        await new SchoolService(db).removeMembership(schoolId, userId);
      });
    },
  };
}
