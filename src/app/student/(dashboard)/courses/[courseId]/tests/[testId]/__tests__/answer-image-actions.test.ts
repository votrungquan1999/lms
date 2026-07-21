import {
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestAnswerImageUploadSlotsAction } from "../answer-image-actions";
import { AnswerImageContentType } from "../answer-image-upload.schema";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireStudentSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireStudentSession })),
}));

beforeEach(async () => {
  await setupTestDb();
  requireStudentSession.mockResolvedValue({ studentId: "student-7" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: student uploads answer photos", () => {
  describe("requesting answer-image upload slots", () => {
    it("returns a presigned slot per photo, keyed under the student, in order", async () => {
      // When the student requests slots for two photos
      const result = await requestAnswerImageUploadSlotsAction([
        {
          fileName: "page1.png",
          contentType: AnswerImageContentType.PNG,
          size: 1000,
        },
        {
          fileName: "page2.jpg",
          contentType: AnswerImageContentType.JPEG,
          size: 2000,
        },
      ]);

      // Then a presigned slot is returned for each, keyed under the student id
      expect(result.success).toBe(true);
      expect(result.slots).toHaveLength(2);
      expect(result.slots?.[0]).toMatchObject({
        url: expect.stringContaining("https://fake-s3.local/put/"),
        contentType: AnswerImageContentType.PNG,
        order: 0,
      });
      expect(result.slots?.[0].key).toContain("answers/student-7/");
      expect(result.slots?.[1].order).toBe(1);
      expect(result.slots?.[0].key).not.toBe(result.slots?.[1].key);
    });
  });
});
