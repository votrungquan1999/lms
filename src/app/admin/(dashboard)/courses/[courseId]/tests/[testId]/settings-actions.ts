"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getTestService } from "src/lib/services-singleton";
import { z } from "zod";

export interface SetTestSettingsState {
  success: boolean;
  message: string;
}

const setTestSettingsSchema = z.object({
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
  showGradeAfterSubmit: z.boolean(),
  showCorrectAnswerAfterSubmit: z.boolean(),
  // Blank/absent ⇒ untimed (null). Otherwise a positive whole number.
  // Preprocessed before coercion because `Number("") === 0` would otherwise
  // turn a blank field into 0 and collide with the positive-only rule.
  timeLimitMinutes: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.coerce
      .number()
      .int("Time limit must be a positive whole number")
      .positive("Time limit must be a positive whole number")
      .nullable(),
  ),
});

/**
 * Server action: overwrites a test's visibility flags from the admin settings panel.
 * Unchecked HTML checkboxes are omitted from FormData, so missing values are coerced to `false`.
 */
export async function setTestSettingsAction(
  _prevState: SetTestSettingsState | null,
  formData: FormData,
): Promise<SetTestSettingsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = setTestSettingsSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    showGradeAfterSubmit: formData.get("showGradeAfterSubmit") === "true",
    showCorrectAnswerAfterSubmit:
      formData.get("showCorrectAnswerAfterSubmit") === "true",
    timeLimitMinutes: formData.get("timeLimitMinutes"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.setTestSettingsAction",
      {
        "lms.action.name": "setTestSettingsAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const testService = await getTestService();
        await testService.updateTestSettings(parsed.data.testId, {
          showGradeAfterSubmit: parsed.data.showGradeAfterSubmit,
          showCorrectAnswerAfterSubmit:
            parsed.data.showCorrectAnswerAfterSubmit,
          timeLimitMinutes: parsed.data.timeLimitMinutes,
          updatedBy: adminUserId,
        });

        revalidatePath(
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        );
        revalidatePath(`/admin/courses/${parsed.data.courseId}`);
        revalidatePath(
          `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        );

        return { success: true, message: "Settings saved" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to save settings";
    return { success: false, message };
  }
}
