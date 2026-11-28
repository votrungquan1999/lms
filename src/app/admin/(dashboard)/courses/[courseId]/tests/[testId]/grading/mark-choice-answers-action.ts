"use server";

import { headers } from "next/headers";
import { revalidateGradingPaths } from "src/app/admin/(dashboard)/grading/page-body/revalidate-grading-paths";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getTestService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { z } from "zod";
import { resolveOwnedTest } from "../test-parent-check";

export interface MarkChoiceAnswersState {
  success: boolean;
  message: string;
}

const MARK_CHOICE_ANSWERS_FAILED_MESSAGE =
  "Marking did not finish. You can try again.";

const markChoiceAnswersSchema = z.object({
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
});

/**
 * Server action: marks every unmarked choice answer of the test's hand-ins from the answer key.
 * Marking is idempotent, so a retry after a failure finishes what the first run left.
 */
export async function markChoiceAnswersAction(
  _prevState: MarkChoiceAnswersState | null,
  formData: FormData,
): Promise<MarkChoiceAnswersState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = markChoiceAnswersSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.markChoiceAnswersAction",
      {
        "lms.action.name": "markChoiceAnswersAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        await resolveOwnedTest(
          await getTestService(schoolId),
          parsed.data.testId,
          parsed.data.courseId,
        );
        await (
          await getTestSubmissionService(schoolId)
        ).markChoiceAnswersForHandIns(parsed.data.testId);
        revalidateGradingPaths(parsed.data.courseId, parsed.data.testId);
        return { success: true, message: "Choice answers marked" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return { success: false, message: MARK_CHOICE_ANSWERS_FAILED_MESSAGE };
  }
}
