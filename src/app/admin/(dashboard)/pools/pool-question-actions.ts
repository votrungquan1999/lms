"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import type { UpdatePoolQuestionInput } from "src/lib/pool-question-service";
import { getPoolQuestionService } from "src/lib/services-singleton";
import {
  type SubmittedMedia,
  submittedMediaSchema,
} from "../courses/[courseId]/tests/[testId]/question-media.schema";
import {
  addPoolQuestionSchema,
  editPoolQuestionSchema,
} from "./pool-question.schema";

export interface AddPoolQuestionState {
  success: boolean;
  message: string;
}

/**
 * Server action: adds a single question to a global pool. Mirrors
 * `addQuestionAction` but scoped to a `poolId` instead of a test/course.
 */
export async function addPoolQuestionAction(
  _prevState: AddPoolQuestionState | null,
  formData: FormData,
): Promise<AddPoolQuestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const type = (formData.get("type") ?? "free_text").toString() as
    | "free_text"
    | "single_select"
    | "multi_select";

  const optionsJson = formData.get("options")?.toString();
  let options: { text: string; isCorrect: boolean }[] | undefined;
  if (optionsJson) {
    try {
      options = JSON.parse(optionsJson);
    } catch {
      return { success: false, message: "Invalid options format" };
    }
  }

  const parsed = addPoolQuestionSchema.safeParse({
    type,
    poolId: formData.get("poolId"),
    title: formData.get("title"),
    content: formData.get("content"),
    ...(options !== undefined && { options }),
    explanation: formData.get("explanation")?.toString(),
    referenceAnswer: formData.get("referenceAnswer")?.toString(),
    answerRevealMode: formData.get("answerRevealMode")?.toString(),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  const mediaJson = formData.get("media")?.toString();
  let media: SubmittedMedia = [];
  if (mediaJson) {
    let rawMedia: unknown;
    try {
      rawMedia = JSON.parse(mediaJson);
    } catch {
      return { success: false, message: "Invalid media format" };
    }
    const parsedMedia = submittedMediaSchema.safeParse(rawMedia);
    if (!parsedMedia.success) {
      return { success: false, message: parsedMedia.error.issues[0].message };
    }
    media = parsedMedia.data;
  }

  try {
    return await withSpan(
      "action.addPoolQuestionAction",
      {
        "lms.action.name": "addPoolQuestionAction",
        "lms.pool.id": parsed.data.poolId,
      },
      async () => {
        const poolQuestionService = await getPoolQuestionService();
        const data = parsed.data;
        if (data.type === "free_text") {
          await poolQuestionService.addPoolQuestion(data.poolId, {
            title: data.title,
            content: data.content,
            type: "free_text",
            createdBy: adminUserId,
            media,
            // Blank/whitespace-only values normalize to "absent" (persisted null).
            referenceAnswer: data.referenceAnswer || undefined,
            explanation: data.explanation || undefined,
            answerRevealMode: data.answerRevealMode,
          });
        } else if (data.type === "single_select") {
          await poolQuestionService.addPoolQuestion(data.poolId, {
            title: data.title,
            content: data.content,
            type: "single_select",
            options: data.options,
            createdBy: adminUserId,
            media,
            // Blank/whitespace-only explanation normalizes to "absent" (persisted null).
            explanation: data.explanation || undefined,
          });
        } else {
          await poolQuestionService.addPoolQuestion(data.poolId, {
            title: data.title,
            content: data.content,
            type: "multi_select",
            options: data.options,
            mcGradingStrategy: data.mcGradingStrategy,
            createdBy: adminUserId,
            media,
            explanation: data.explanation || undefined,
          });
        }
        revalidatePath(`/admin/pools/${data.poolId}`);
        return { success: true, message: "Question added to pool" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to add question";
    return { success: false, message };
  }
}

export interface UpdatePoolQuestionState {
  success: boolean;
  message: string;
}

/**
 * Server action: corrects a pool question a teacher already wrote (Step 30 —
 * mirrors `updateQuestionAction`, a parallel path per D30).
 */
export async function updatePoolQuestionAction(
  _prevState: UpdatePoolQuestionState | null,
  formData: FormData,
): Promise<UpdatePoolQuestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const optionsJson = formData.get("options")?.toString();
  let options: { id?: string; text: string; isCorrect: boolean }[] | undefined;
  if (optionsJson) {
    try {
      options = JSON.parse(optionsJson);
    } catch {
      return { success: false, message: "Invalid options format" };
    }
  }

  const parsed = editPoolQuestionSchema.safeParse({
    poolQuestionId: formData.get("poolQuestionId"),
    poolId: formData.get("poolId"),
    answerRevealMode: formData.get("answerRevealMode") ?? undefined,
    referenceAnswer: formData.get("referenceAnswer") ?? undefined,
    explanation: formData.get("explanation") ?? undefined,
    title: formData.get("title") ?? undefined,
    content: formData.get("content") ?? undefined,
    ...(options !== undefined && { options }),
    type: formData.get("type") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.updatePoolQuestionAction",
      {
        "lms.action.name": "updatePoolQuestionAction",
        "lms.pool.id": parsed.data.poolId,
      },
      async () => {
        const poolQuestionService = await getPoolQuestionService();
        const data = parsed.data;

        const input: UpdatePoolQuestionInput = {};
        if (data.answerRevealMode !== undefined) {
          input.answerRevealMode =
            data.answerRevealMode === "inherit" ? null : data.answerRevealMode;
        }
        if (data.referenceAnswer !== undefined) {
          input.referenceAnswer =
            data.referenceAnswer.trim() === ""
              ? null
              : data.referenceAnswer.trim();
        }
        if (data.explanation !== undefined) {
          input.explanation =
            data.explanation.trim() === "" ? null : data.explanation.trim();
        }
        if (data.title !== undefined) {
          input.title = data.title;
        }
        if (data.content !== undefined) {
          input.content = data.content;
        }
        if (data.options !== undefined) {
          input.options = data.options;
        }
        if (data.type !== undefined) {
          input.type = data.type;
        }

        await poolQuestionService.updatePoolQuestion(
          data.poolQuestionId,
          input,
          adminUserId,
        );

        revalidatePath(`/admin/pools/${data.poolId}`);

        return { success: true, message: "Question updated" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to update question";
    return { success: false, message };
  }
}

export interface DeletePoolQuestionState {
  success: boolean;
  message: string;
}

/**
 * Server action: soft-deletes a pool question (Step 30 / D37/D51).
 */
export async function deletePoolQuestionAction(
  _prevState: DeletePoolQuestionState | null,
  formData: FormData,
): Promise<DeletePoolQuestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const poolQuestionId = formData.get("poolQuestionId")?.toString() ?? "";
  const poolId = formData.get("poolId")?.toString() ?? "";

  if (!poolQuestionId || !poolId) {
    return {
      success: false,
      message: "Pool question ID or Pool ID is missing",
    };
  }

  try {
    return await withSpan(
      "action.deletePoolQuestionAction",
      {
        "lms.action.name": "deletePoolQuestionAction",
        "lms.pool.id": poolId,
      },
      async () => {
        const poolQuestionService = await getPoolQuestionService();
        await poolQuestionService.deletePoolQuestion(
          poolQuestionId,
          adminUserId,
        );

        revalidatePath(`/admin/pools/${poolId}`);

        return { success: true, message: "Question deleted" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to delete question";
    return { success: false, message };
  }
}
