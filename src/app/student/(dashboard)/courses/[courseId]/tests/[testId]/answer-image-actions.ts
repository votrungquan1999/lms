"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getS3StorageService } from "src/lib/services-singleton";
import type { StudentSession } from "src/lib/session";
import {
  ANSWER_IMAGE_EXTENSION_BY_CONTENT_TYPE,
  type AnswerImageContentType,
  type RequestAnswerImageUploadSlotsInput,
  type RequestAnswerImageUploadSlotsState,
  requestAnswerImageUploadSlotsSchema,
} from "./answer-image-upload.schema";

/**
 * Server action: validates a student's requested answer photos (image type and
 * size) and mints a presigned PUT slot per photo, scoped under the student's S3
 * namespace (`answers/<studentId>/<uuid>.<ext>`), preserving order. The
 * studentId comes from the session — a student cannot target another's keys.
 * No enrollment check needed: this only mints upload URLs, writes nothing.
 * @param files - The photos the student wants to upload, in chosen order.
 * @returns Presigned PUT slots in order, or a failure message.
 */
export async function requestAnswerImageUploadSlotsAction(
  files: RequestAnswerImageUploadSlotsInput[],
): Promise<RequestAnswerImageUploadSlotsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let studentId: string;
  try {
    const session = await authService.requireStudentSession(requestHeaders);
    studentId = (session as StudentSession).studentId;
  } catch {
    return { success: false, message: "Unauthorized: student access required" };
  }

  const parsed = requestAnswerImageUploadSlotsSchema.safeParse(files);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  return withSpan(
    "action.requestAnswerImageUploadSlotsAction",
    { "lms.action.name": "requestAnswerImageUploadSlotsAction" },
    async () => {
      const s3 = await getS3StorageService();

      const slots = await Promise.all(
        parsed.data.map(async (file, index) => {
          const extension =
            ANSWER_IMAGE_EXTENSION_BY_CONTENT_TYPE[
              file.contentType as AnswerImageContentType
            ];
          const key = `answers/${studentId}/${randomUUID()}.${extension}`;
          const { url } = await s3.getPresignedUploadUrl(key, file.contentType);
          return {
            key,
            url,
            contentType: file.contentType,
            fileName: file.fileName,
            size: file.size,
            order: index,
          };
        }),
      );

      return { success: true, message: "Upload slots created", slots };
    },
  );
}
