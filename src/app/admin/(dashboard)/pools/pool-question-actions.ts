"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getPoolQuestionService } from "src/lib/services-singleton";
import {
  type SubmittedMedia,
  submittedMediaSchema,
} from "../courses/[courseId]/tests/[testId]/question-media.schema";
import { addPoolQuestionSchema } from "./pool-question.schema";

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
          });
        } else if (data.type === "single_select") {
          await poolQuestionService.addPoolQuestion(data.poolId, {
            title: data.title,
            content: data.content,
            type: "single_select",
            options: data.options,
            createdBy: adminUserId,
            media,
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
