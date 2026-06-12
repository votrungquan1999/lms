"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getQuestionPoolService } from "src/lib/services-singleton";
import { z } from "zod";

const createPoolSchema = z.object({
  name: z.string().trim().min(1, "Pool name is required"),
  description: z.string().trim().default(""),
});

const renamePoolSchema = z.object({
  poolId: z.string().trim().min(1, "Pool id is required"),
  name: z.string().trim().min(1, "Pool name is required"),
});

const deletePoolSchema = z.object({
  poolId: z.string().trim().min(1, "Pool id is required"),
});

export interface PoolActionState {
  success: boolean;
  message: string;
}

/**
 * Server action: creates a new global question pool.
 */
export async function createPoolAction(
  _prevState: PoolActionState | null,
  formData: FormData,
): Promise<PoolActionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = createPoolSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.createPoolAction",
      { "lms.action.name": "createPoolAction" },
      async () => {
        const poolService = await getQuestionPoolService();
        const pool = await poolService.createPool({
          ...parsed.data,
          createdBy: adminUserId,
        });
        revalidatePath("/admin/pools");
        return {
          success: true,
          message: `Pool "${pool.name}" created successfully`,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to create pool";
    return { success: false, message };
  }
}

/**
 * Server action: renames an existing question pool.
 */
export async function renamePoolAction(
  _prevState: PoolActionState | null,
  formData: FormData,
): Promise<PoolActionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = renamePoolSchema.safeParse({
    poolId: formData.get("poolId"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.renamePoolAction",
      { "lms.action.name": "renamePoolAction" },
      async () => {
        const poolService = await getQuestionPoolService();
        await poolService.renamePool(
          parsed.data.poolId,
          parsed.data.name,
          adminUserId,
        );
        revalidatePath("/admin/pools");
        revalidatePath(`/admin/pools/${parsed.data.poolId}`);
        return { success: true, message: "Pool renamed successfully" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to rename pool";
    return { success: false, message };
  }
}

/**
 * Server action: soft-deletes a question pool.
 */
export async function deletePoolAction(
  _prevState: PoolActionState | null,
  formData: FormData,
): Promise<PoolActionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = deletePoolSchema.safeParse({
    poolId: formData.get("poolId"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.deletePoolAction",
      { "lms.action.name": "deletePoolAction" },
      async () => {
        const poolService = await getQuestionPoolService();
        await poolService.deletePool(parsed.data.poolId, adminUserId);
        revalidatePath("/admin/pools");
        return { success: true, message: "Pool removed successfully" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to remove pool";
    return { success: false, message };
  }
}
