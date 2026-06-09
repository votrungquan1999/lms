import { MediaContentType } from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addQuestionAction } from "../actions";
import { requestUploadSlotsAction } from "../question-media-actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** Builds the FormData the add-question form submits, with media as a JSON field. */
function buildFreeTextFormData(testId: string, media?: unknown): FormData {
  const formData = new FormData();
  formData.set("type", "free_text");
  formData.set("testId", testId);
  formData.set("courseId", "course-1");
  formData.set("title", "Question with media");
  formData.set("content", "See the attached files.");
  if (media !== undefined) {
    formData.set("media", JSON.stringify(media));
  }
  return formData;
}

describe("Feature: teacher attaches media to a question", () => {
  describe("requesting upload slots", () => {
    it("returns presigned PUT URLs for up to 3 files, in request order", async () => {
      // When the teacher requests slots for two files
      const result = await requestUploadSlotsAction([
        { fileName: "a.png", contentType: MediaContentType.PNG, size: 1000 },
        { fileName: "b.mp4", contentType: MediaContentType.MP4, size: 2000 },
      ]);

      // Then a slot with a presigned URL + key is returned for each, in order
      expect(result.success).toBe(true);
      expect(result.slots).toHaveLength(2);
      expect(result.slots?.[0]).toMatchObject({
        url: expect.stringContaining("https://fake-s3.local/put/"),
        contentType: MediaContentType.PNG,
        order: 0,
      });
      expect(result.slots?.[1]).toMatchObject({
        contentType: MediaContentType.MP4,
        order: 1,
      });
      expect(result.slots?.[0].key).not.toBe(result.slots?.[1].key);
    });
  });

  describe("creating a question with media", () => {
    it("persists the submitted media against the question, in the teacher's order", async () => {
      // When the teacher creates a question with two ordered media entries
      const result = await addQuestionAction(
        null,
        buildFreeTextFormData("test-1", [
          {
            key: "media/questions/first.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 1000,
            fileName: "first.png",
          },
          {
            key: "media/questions/second.mp4",
            contentType: MediaContentType.MP4,
            order: 1,
            size: 2000,
            fileName: "second.mp4",
          },
        ]),
      );

      // Then the question is created and carries its media in order (keys preserved)
      expect(result.success).toBe(true);
      const [question] =
        await getTestServices().questionService.listQuestions("test-1");
      expect(question.media.map((m) => m.key)).toEqual([
        "media/questions/first.png",
        "media/questions/second.mp4",
      ]);
      expect(question.media.map((m) => m.order)).toEqual([0, 1]);
    });

    it("refuses more than 3 media, a disallowed type, or an oversize file, and persists nothing", async () => {
      const tooMany = [0, 1, 2, 3].map((i) => ({
        key: `media/questions/x${i}.png`,
        contentType: MediaContentType.PNG,
        order: i,
        size: 1000,
        fileName: `x${i}.png`,
      }));
      const badType = [
        {
          key: "media/questions/bad.gif",
          contentType: "image/gif",
          order: 0,
          size: 1000,
          fileName: "bad.gif",
        },
      ];
      const oversize = [
        {
          key: "media/questions/big.mp4",
          contentType: MediaContentType.MP4,
          order: 0,
          size: 10 * 1024 * 1024 + 1,
          fileName: "big.mp4",
        },
      ];

      const results = await Promise.all([
        addQuestionAction(null, buildFreeTextFormData("test-1", tooMany)),
        addQuestionAction(null, buildFreeTextFormData("test-1", badType)),
        addQuestionAction(null, buildFreeTextFormData("test-1", oversize)),
      ]);

      for (const result of results) {
        expect(result.success).toBe(false);
      }
      const questions =
        await getTestServices().questionService.listQuestions("test-1");
      expect(questions).toHaveLength(0);
    });
  });

  describe("authorization", () => {
    it("refuses a non-admin caller and persists nothing", async () => {
      requireAdminSession.mockRejectedValue(new Error("not admin"));

      const slotResult = await requestUploadSlotsAction([
        { fileName: "a.png", contentType: MediaContentType.PNG, size: 1000 },
      ]);
      const createResult = await addQuestionAction(
        null,
        buildFreeTextFormData("test-1", [
          {
            key: "media/questions/first.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 1000,
            fileName: "first.png",
          },
        ]),
      );

      expect(slotResult.success).toBe(false);
      expect(slotResult.message).toContain("Unauthorized");
      expect(createResult.success).toBe(false);
      const questions =
        await getTestServices().questionService.listQuestions("test-1");
      expect(questions).toHaveLength(0);
    });
  });
});
