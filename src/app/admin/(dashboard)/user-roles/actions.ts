"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getUserRoleService } from "src/lib/services-singleton";
import { Role } from "src/lib/session";
import { z } from "zod";

const setRoleSchema = z.object({
  userId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, "userId is required")
    // ObjectId hex is case-insensitive; normalize so the self-demotion
    // compare below can't be dodged with an uppercase form of the same id.
    .transform((v) => v.toLowerCase()),
});

export interface SetRoleState {
  success: boolean;
  message: string;
}

/**
 * Every refusal below returns before withSpan runs, which would otherwise
 * leave an attempted privilege operation with no trace at all — on the
 * branch whose entire subject is authorization. Ids/enums only, matching the
 * attribute keys withSpan already records on the success path.
 */
function logRefusal(action: string, attributes: Record<string, string>): void {
  console.warn(`${action}.refused`, attributes);
}

/**
 * Server action: grants administrator access to the given user (D22).
 * Re-checks Tier 2 itself — never trusts the page guard alone (D26).
 */
export async function grantAdminAction(
  _prevState: SetRoleState | null,
  formData: FormData,
): Promise<SetRoleState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let ownerUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    const isOwner = await authService.isAdminEmail(session.email);
    if (!isOwner) {
      logRefusal("action.grantAdminAction", {
        "lms.reason": "not-owner",
        "lms.owner.id": session.userId,
      });
      return {
        success: false,
        message: "Unauthorized: owner access required",
      };
    }
    ownerUserId = session.userId;
  } catch {
    logRefusal("action.grantAdminAction", { "lms.reason": "unauthenticated" });
    return { success: false, message: "Unauthorized: owner access required" };
  }

  const parsed = setRoleSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    logRefusal("action.grantAdminAction", {
      "lms.reason": "invalid-user-id",
      "lms.owner.id": ownerUserId,
    });
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.grantAdminAction",
      {
        "lms.action.name": "grantAdminAction",
        "lms.user.id": parsed.data.userId,
        "lms.owner.id": ownerUserId,
      },
      async () => {
        const userRoleService = await getUserRoleService();
        await userRoleService.setRole(parsed.data.userId, Role.Admin);
        revalidatePath("/admin/user-roles");
        return { success: true, message: "Administrator access granted." };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to update role";
    return { success: false, message };
  }
}

/**
 * Server action: revokes administrator access from the given user (D22).
 * Re-checks Tier 2 itself — never trusts the page guard alone (D26). Does
 * NOT share its owner check with grantAdminAction (defence in depth).
 */
export async function revokeAdminAction(
  _prevState: SetRoleState | null,
  formData: FormData,
): Promise<SetRoleState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let ownerUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    const isOwner = await authService.isAdminEmail(session.email);
    if (!isOwner) {
      logRefusal("action.revokeAdminAction", {
        "lms.reason": "not-owner",
        "lms.owner.id": session.userId,
      });
      return {
        success: false,
        message: "Unauthorized: owner access required",
      };
    }
    ownerUserId = session.userId;
  } catch {
    logRefusal("action.revokeAdminAction", {
      "lms.reason": "unauthenticated",
    });
    return { success: false, message: "Unauthorized: owner access required" };
  }

  const parsed = setRoleSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    logRefusal("action.revokeAdminAction", {
      "lms.reason": "invalid-user-id",
      "lms.owner.id": ownerUserId,
    });
    return { success: false, message: parsed.error.issues[0].message };
  }

  // D25: an owner can correct someone else's wrong grant, but never their
  // own — that would risk locking the whole school out of the app.
  if (parsed.data.userId === ownerUserId) {
    logRefusal("action.revokeAdminAction", {
      "lms.reason": "self-demotion",
      "lms.owner.id": ownerUserId,
    });
    return {
      success: false,
      message: "You cannot remove your own administrator access.",
    };
  }

  try {
    return await withSpan(
      "action.revokeAdminAction",
      {
        "lms.action.name": "revokeAdminAction",
        "lms.user.id": parsed.data.userId,
        "lms.owner.id": ownerUserId,
      },
      async () => {
        const userRoleService = await getUserRoleService();
        await userRoleService.setRole(parsed.data.userId, Role.Student);
        revalidatePath("/admin/user-roles");
        return { success: true, message: "Administrator access revoked." };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to update role";
    return { success: false, message };
  }
}
