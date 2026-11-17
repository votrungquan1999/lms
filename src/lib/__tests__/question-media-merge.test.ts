import { describe, expect, it } from "vitest";
import { mergeEditedMedia } from "../question-media-merge";
import {
  MediaContentType,
  type QuestionMediaDocument,
} from "../question-service";

/**
 * Builds a stored picture entry for the merge tests.
 * @param name - Short name used for the key and file name.
 * @param order - The stored position.
 */
function stored(name: string, order: number): QuestionMediaDocument {
  return {
    key: `media/${name}.png`,
    contentType: MediaContentType.PNG,
    order,
    size: 100 + order,
    fileName: `${name}.png`,
  };
}

describe("mergeEditedMedia", () => {
  it("fills kept entries from storage, keeps new ones and renumbers by position", () => {
    const merged = mergeEditedMedia(
      [stored("a", 0), stored("b", 1)],
      [{ key: "media/b.png" }, { ...stored("c", 7) }],
    );

    expect(merged).toEqual([
      { ...stored("b", 1), order: 0 },
      { ...stored("c", 7), order: 1 },
    ]);
  });

  it("returns the stored list unchanged for an unchanged submission", () => {
    const before = [stored("a", 0), stored("b", 1)];

    expect(
      mergeEditedMedia(before, [
        { key: "media/a.png" },
        { key: "media/b.png" },
      ]),
    ).toEqual(before);
  });

  it("refuses a kept key the question does not hold", () => {
    expect(() =>
      mergeEditedMedia([stored("a", 0)], [{ key: "media/other.png" }]),
    ).toThrow("Invalid media key");
  });

  it("refuses a repeated key", () => {
    expect(() =>
      mergeEditedMedia(
        [stored("a", 0)],
        [{ key: "media/a.png" }, { key: "media/a.png" }],
      ),
    ).toThrow("Invalid media key");
  });

  it("refuses more than three entries", () => {
    expect(() =>
      mergeEditedMedia(
        [],
        [stored("a", 0), stored("b", 1), stored("c", 2), stored("d", 3)],
      ),
    ).toThrow("at most 3");
  });
});
