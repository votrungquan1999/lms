import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachAnswerImageUrls } from "../answer-image-urls";

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

describe("attachAnswerImageUrls", () => {
  it("mints a presigned GET URL per media key, preserving order", async () => {
    const result = await attachAnswerImageUrls([
      "answers/s/a.png",
      "answers/s/b.png",
    ]);

    expect(result).toEqual([
      { key: "answers/s/a.png", url: "https://signed.example/answers/s/a.png" },
      { key: "answers/s/b.png", url: "https://signed.example/answers/s/b.png" },
    ]);
  });

  it("returns an empty array when there are no keys", async () => {
    const result = await attachAnswerImageUrls([]);
    expect(result).toEqual([]);
    expect(mockGetPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});
