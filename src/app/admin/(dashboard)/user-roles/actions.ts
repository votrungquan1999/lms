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
    .regex(/^[0-9a-fA-F]{24}$/, "userId is required"),
});

export interface SetRoleState {
  success: boolean;
  message: string;
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
      return {
        success: false,
        message: "Unauthorized: owner access required",
      };
    }
    ownerUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: owner access required" };
  }

  const parsed = setRoleSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
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
