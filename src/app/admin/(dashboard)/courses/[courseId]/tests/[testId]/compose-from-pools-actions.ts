"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import type { ComposePoolSelection } from "src/lib/question-compose";
import {
  getPoolQuestionService,
  getQuestionService,
} from "src/lib/services-singleton";
import { z } from "zod";

const composeSchema = z.object({
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
  selections: z
    .array(
      z.object({
        poolId: z.string().min(1),
        count: z.number().int().min(1),
      }),
    )
    .min(1, "Select at least one pool"),
});

export interface ComposeFromPoolsState {
  success: boolean;
  message: string;
}

/**
 * Server action: composes questions into a test by drawing from selected pools.
 * Resolves each pool's snapshot inputs, then delegates the snapshot/insert to
 * `QuestionService.composeFromPools`.
 */
export async function composeFromPoolsAction(
  _prevState: ComposeFromPoolsState | null,
  formData: FormData,
): Promise<ComposeFromPoolsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const selectionsJson = formData.get("selections")?.toString();
  let rawSelections: unknown;
  try {
    rawSelections = selectionsJson ? JSON.parse(selectionsJson) : [];
  } catch {
    return { success: false, message: "Invalid selections format" };
  }

  const parsed = composeSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    selections: rawSelections,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.composeFromPoolsAction",
      {
        "lms.action.name": "composeFromPoolsAction",
        "lms.test.id": parsed.data.testId,
      },
      async () => {
        const poolQuestionService = await getPoolQuestionService();
        const questionService = await getQuestionService();

        const selections: ComposePoolSelection[] = await Promise.all(
          parsed.data.selections.map(async (selection) => ({
            count: selection.count,
            questions: await poolQuestionService.listSnapshotInputs(
              selection.poolId,
            ),
          })),
        );

        const composed = await questionService.composeFromPools(
          parsed.data.testId,
          selections,
          adminUserId,
        );

        revalidatePath(
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        );
        return {
          success: true,
          message: `Added ${composed.length} question${composed.length !== 1 ? "s" : ""} from pools`,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to compose from pools";
    return { success: false, message };
  }
}
