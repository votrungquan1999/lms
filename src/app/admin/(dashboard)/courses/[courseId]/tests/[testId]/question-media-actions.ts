"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getS3StorageService } from "src/lib/services-singleton";
import {
  EXTENSION_BY_CONTENT_TYPE,
  type RequestUploadSlotsInput,
  type RequestUploadSlotsState,
  requestUploadSlotsSchema,
} from "./question-media.schema";

/**
 * Server action: validates the requested files (count/type/size) and mints a
 * presigned PUT upload slot per file, preserving request order.
 * @param files - The files the teacher wants to upload, in their chosen order.
 * @returns Presigned PUT slots in order, or a failure message.
 */
export async function requestUploadSlotsAction(
  files: RequestUploadSlotsInput[],
): Promise<RequestUploadSlotsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = requestUploadSlotsSchema.safeParse(files);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  return withSpan(
    "action.requestUploadSlotsAction",
    { "lms.action.name": "requestUploadSlotsAction" },
    async () => {
      const s3 = await getS3StorageService();

      const slots = await Promise.all(
        parsed.data.map(async (file, index) => {
          const extension = EXTENSION_BY_CONTENT_TYPE[file.contentType];
          const key = `media/questions/${randomUUID()}.${extension}`;
          const { url } = await s3.getPresignedUploadUrl(key, file.contentType);
          return { key, url, contentType: file.contentType, order: index };
        }),
      );

      return { success: true, message: "Upload slots created", slots };
    },
  );
}
