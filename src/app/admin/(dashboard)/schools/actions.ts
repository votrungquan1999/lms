"use server";

import { MongoServerError } from "mongodb";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getSchoolService } from "src/lib/services-singleton";
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

/**
 * Every refusal below returns before withSpan runs, matching
 * user-roles/actions.ts's rationale: an attempted privilege operation must
 * leave a trace even when it never reaches the traced work.
 */
function logRefusal(action: string, attributes: Record<string, string>): void {
  console.warn(`${action}.refused`, attributes);
}

/**
 * Server action: creates a new school (D8, D62). Owner-only — re-checks
 * Tier 2 itself, never trusts the page guard alone. Creating a school gives
 * nobody a membership, the owner included (R5) — membership is step 2's.
 */
export async function createSchoolAction(
  _prevState: CreateSchoolState | null,
  formData: FormData,
): Promise<CreateSchoolState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let ownerUserId: string;
  try {
    const session = await authService.requireOwnerSession(requestHeaders);
    ownerUserId = session.userId;
  } catch {
    logRefusal("action.createSchoolAction", {
      "lms.reason": "unauthenticated",
    });
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
