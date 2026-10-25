"use server";

import { MongoServerError } from "mongodb";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { STUDENT_ACCOUNT_CANNOT_BE_ADMIN } from "src/lib/account-kind-refusals";
import { OwnerRequiredError } from "src/lib/auth-service";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getSchoolDirectory,
  getSchoolService,
  getUserRoleService,
} from "src/lib/services-singleton";
import { Role } from "src/lib/session";
import { z } from "zod";

const createSchoolSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must be lowercase letters, numbers and hyphens only",
    ),
});

export interface CreateSchoolState {
  success: boolean;
  message: string;
}

const manageSchoolAdminSchema = z.object({
  schoolId: z.string().trim().min(1, "schoolId is required"),
  userId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, "userId is required")
    .transform((v) => v.toLowerCase()),
});

export interface ManageSchoolAdminState {
  success: boolean;
  message: string;
}

/**
 * Every refusal below returns before withSpan runs, matching
 * user-roles/actions.ts's rationale: an attempted privilege operation must
 * leave a trace even when it never reaches the traced work.
 */
function logRefusal(action: string, attributes: Record<string, string>): void {
  console.warn(`${action}.refused`, attributes);
}

/** A signed-in non-owner admin is logged by id; anyone else as unauthenticated. */
function ownerRefusalAttributes(error: unknown): Record<string, string> {
  if (error instanceof OwnerRequiredError) {
    return { "lms.reason": "not-owner", "lms.owner.id": error.userId };
  }
  return { "lms.reason": "unauthenticated" };
}

/**
 * Returns the caller's user id when they are the platform owner; otherwise
 * logs the refusal and returns null so the action refuses before any input.
 * @param action - The action name the refusal is logged under.
 */
async function ownerUserIdOrNull(action: string): Promise<string | null> {
  const authService = await getAuthService();
  try {
    const session = await authService.requireOwnerSession(await headers());
    return session.userId;
  } catch (error) {
    logRefusal(action, ownerRefusalAttributes(error));
    return null;
  }
}

/**
 * Server action: creates a new school. Owner-only — re-checks Tier 2
 * itself, never trusts the page guard alone. Creating a school gives nobody
 * a membership, the owner included.
 */
export async function createSchoolAction(
  _prevState: CreateSchoolState | null,
  formData: FormData,
): Promise<CreateSchoolState> {
  const ownerUserId = await ownerUserIdOrNull("action.createSchoolAction");
  if (!ownerUserId) {
    return { success: false, message: "Unauthorized: owner access required" };
  }

  const parsed = createSchoolSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    logRefusal("action.createSchoolAction", {
      "lms.reason": "invalid-input",
      "lms.owner.id": ownerUserId,
    });
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.createSchoolAction",
      {
        "lms.action.name": "createSchoolAction",
        "lms.school.slug": parsed.data.slug,
        "lms.owner.id": ownerUserId,
      },
      async () => {
        const schoolService = await getSchoolService();
        await schoolService.createSchool({
          name: parsed.data.name,
          slug: parsed.data.slug,
          createdBy: ownerUserId,
        });
        revalidatePath("/admin/schools");
        return { success: true, message: "School created." };
      },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return {
        success: false,
        message: "A school with that slug already exists",
      };
    }
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to create school";
    return { success: false, message };
  }
}

/**
 * Server action: makes an existing account a school admin, recording the
 * admin role as well as the membership.
 */
export async function addSchoolAdminAction(
  _prevState: ManageSchoolAdminState | null,
  formData: FormData,
): Promise<ManageSchoolAdminState> {
  const ownerUserId = await ownerUserIdOrNull("action.addSchoolAdminAction");
  if (!ownerUserId) {
    return { success: false, message: "Unauthorized: owner access required" };
  }

  const parsed = manageSchoolAdminSchema.safeParse({
    schoolId: formData.get("schoolId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    logRefusal("action.addSchoolAdminAction", {
      "lms.reason": "invalid-input",
      "lms.owner.id": ownerUserId,
    });
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.addSchoolAdminAction",
      {
        "lms.action.name": "addSchoolAdminAction",
        "lms.school.id": parsed.data.schoolId,
        "lms.user.id": parsed.data.userId,
        "lms.owner.id": ownerUserId,
      },
      async () => {
        const schoolService = await getSchoolService();
        // Before the role write, so a stale form never grants admin to nothing.
        if (!(await schoolService.getSchool(parsed.data.schoolId))) {
          return { success: false, message: "School not found" };
        }
        // No account is both a student and an admin; refuse before any write.
        const schoolDirectory = await getSchoolDirectory();
        if (await schoolDirectory.findByAuthUserId(parsed.data.userId)) {
          logRefusal("action.addSchoolAdminAction", {
            "lms.reason": "has-student-profile",
            "lms.owner.id": ownerUserId,
            "lms.user.id": parsed.data.userId,
          });
          return { success: false, message: STUDENT_ACCOUNT_CANNOT_BE_ADMIN };
        }
        const userRoleService = await getUserRoleService();
        // Role first, so an interrupted add never leaves a role-less membership.
        await userRoleService.setRole(parsed.data.userId, Role.Admin);
        await schoolService.addMembership(
          parsed.data.schoolId,
          parsed.data.userId,
          ownerUserId,
        );
        revalidatePath(`/admin/schools/${parsed.data.schoolId}`);
        return { success: true, message: "Admin added." };
      },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return {
        success: false,
        message: "This account is already an admin of this school.",
      };
    }
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to add school admin";
    return { success: false, message };
  }
}

/**
 * Server action: removes a school admin's membership. The admin role stays;
 * only revoking it on the user-roles page removes every school at once.
 */
export async function removeSchoolAdminAction(
  _prevState: ManageSchoolAdminState | null,
  formData: FormData,
): Promise<ManageSchoolAdminState> {
  const ownerUserId = await ownerUserIdOrNull("action.removeSchoolAdminAction");
  if (!ownerUserId) {
    return { success: false, message: "Unauthorized: owner access required" };
  }

  const parsed = manageSchoolAdminSchema.safeParse({
    schoolId: formData.get("schoolId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    logRefusal("action.removeSchoolAdminAction", {
      "lms.reason": "invalid-input",
      "lms.owner.id": ownerUserId,
    });
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.removeSchoolAdminAction",
      {
        "lms.action.name": "removeSchoolAdminAction",
        "lms.school.id": parsed.data.schoolId,
        "lms.user.id": parsed.data.userId,
        "lms.owner.id": ownerUserId,
      },
      async () => {
        const schoolService = await getSchoolService();
        const removed = await schoolService.removeMembership(
          parsed.data.schoolId,
          parsed.data.userId,
        );
        if (!removed) {
          return {
            success: false,
            message: "This account is not an admin of this school.",
          };
        }
        revalidatePath(`/admin/schools/${parsed.data.schoolId}`);
        return { success: true, message: "Admin removed." };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to remove school admin";
    return { success: false, message };
  }
}
