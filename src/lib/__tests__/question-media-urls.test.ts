import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachQuestionMediaUrls } from "../question-media-urls";
import {
  MediaContentType,
  type Question,
  type SingleSelectQuestion,
} from "../question-service";

const mockGetPresignedDownloadUrl = vi.fn();
vi.mock("src/lib/services-singleton", () => ({
  getS3StorageService: () =>
    Promise.resolve({
      getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
    }),
}));

beforeEach(() => {
  mockGetPresignedDownloadUrl.mockReset();
  mockGetPresignedDownloadUrl.mockImplementation((key: string) =>
    Promise.resolve(`https://signed.example/${key}`),
  );
});

/** Builds a free_text question with the given media entries. */
function freeTextQuestion(
  id: string,
  media: Question["media"],
): Question {
  return {
    id,
    testId: "test-1",
    title: "Q",
    content: "...",
    order: 1,
    createdAt: new Date(),
    weight: 1,
    type: "free_text",
    media,
  };
}

describe("attachQuestionMediaUrls", () => {
  it("mints a presigned URL per media entry, preserving order across questions", async () => {
    const input: Question[] = [
      freeTextQuestion("q1", [
        { key: "media/a.png", url: "", contentType: MediaContentType.PNG, order: 0 },
        { key: "media/b.mp4", url: "", contentType: MediaContentType.MP4, order: 1 },
      ]),
      freeTextQuestion("q2", [
        { key: "media/c.webp", url: "", contentType: MediaContentType.WEBP, order: 0 },
      ]),
    ];

    const result = await attachQuestionMediaUrls(input);

    expect(result[0].media).toEqual([
      {
        key: "media/a.png",
        url: "https://signed.example/media/a.png",
        contentType: MediaContentType.PNG,
        order: 0,
      },
      {
        key: "media/b.mp4",
        url: "https://signed.example/media/b.mp4",
        contentType: MediaContentType.MP4,
        order: 1,
      },
    ]);
    expect(result[1].media[0].url).toBe("https://signed.example/media/c.webp");
  });

  it("leaves no-media questions untouched, preserves the union, and never mutates input", async () => {
    const withMedia = freeTextQuestion("q1", [
      { key: "media/a.png", url: "", contentType: MediaContentType.PNG, order: 0 },
    ]);
    const singleSelect: SingleSelectQuestion = {
      id: "q2",
      testId: "test-1",
      title: "Pick one",
      content: "...",
      order: 2,
      createdAt: new Date(),
      weight: 1,
      type: "single_select",
      options: [{ id: "o1", text: "A", isCorrect: true }],
      mcGradingStrategy: "all_or_nothing",
      media: [],
    };

    const result = await attachQuestionMediaUrls([withMedia, singleSelect]);

    // No-media question untouched and no URL minted for it
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledTimes(1);
    expect(result[1]).toBe(singleSelect);

    // Discriminated-union fields preserved on the single_select branch
    const selected = result[1] as SingleSelectQuestion;
    expect(selected.options).toHaveLength(1);
    expect(selected.mcGradingStrategy).toBe("all_or_nothing");

    // Input not mutated: original media URL still empty, new object returned
    expect(withMedia.media[0].url).toBe("");
    expect(result[0]).not.toBe(withMedia);
  });
});
