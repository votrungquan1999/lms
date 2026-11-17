import { describe, expect, it } from "vitest";
import {
  applyMediaChange,
  assertPictureLinksHeld,
  INVALID_MEDIA_KEY_MESSAGE,
} from "../question-media-merge";
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

describe("applyMediaChange", () => {
  it("removes the named keys, appends new uploads and renumbers by position", () => {
    const result = applyMediaChange([stored("a", 0), stored("b", 1)], {
      removedKeys: ["media/a.png"],
      added: [stored("c", 7)],
    });

    expect(result.media).toEqual([
      { ...stored("b", 1), order: 0 },
      { ...stored("c", 7), order: 1 },
    ]);
    expect(result.removedKeys).toEqual(["media/a.png"]);
  });

  it("returns the stored list unchanged for an empty change", () => {
    const current = [stored("a", 0), stored("b", 1)];

    const result = applyMediaChange(current, { removedKeys: [], added: [] });

    expect(result.media).toEqual(current);
    expect(result.removedKeys).toEqual([]);
  });

  it("ignores a removed key the question no longer holds and does not report it as removed", () => {
    const result = applyMediaChange([stored("a", 0)], {
      removedKeys: ["media/gone.png", "media/a.png"],
      added: [],
    });

    expect(result.media).toEqual([]);
    expect(result.removedKeys).toEqual(["media/a.png"]);
  });

  it("refuses an added key the question already holds or that repeats", () => {
    expect(() =>
      applyMediaChange([stored("a", 0)], {
        removedKeys: [],
        added: [stored("a", 1)],
      }),
    ).toThrow("Invalid media key");
    expect(() =>
      applyMediaChange([], {
        removedKeys: [],
        added: [stored("b", 0), stored("b", 1)],
      }),
    ).toThrow("Invalid media key");
  });

  it("refuses a merged result of more than three", () => {
    expect(() =>
      applyMediaChange([stored("a", 0), stored("b", 1), stored("c", 2)], {
        removedKeys: [],
        added: [stored("d", 3)],
      }),
    ).toThrow("A question can have at most 3 media files");
  });
});

describe("applyMediaChange media cap", () => {
  it("accepts a result of exactly the 3-file cap", () => {
    const result = applyMediaChange([stored("a", 0), stored("b", 1)], {
      removedKeys: [],
      added: [stored("c", 2)],
    });

    expect(result.media).toHaveLength(3);
  });
});

describe("assertPictureLinksHeld", () => {
  const link = (key: string) => `{{picture:${key}}}`;
  const video = {
    key: "media/v.mp4",
    contentType: MediaContentType.MP4,
  };

  it("refuses unknown and video keys, and allows removed or already-saved ones", () => {
    const held = [stored("a", 0), video];

    expect(() =>
      assertPictureLinksHeld([link("media/a.png")], held),
    ).not.toThrow();
    expect(() => assertPictureLinksHeld([link("media/x.png")], held)).toThrow(
      INVALID_MEDIA_KEY_MESSAGE,
    );
    expect(() => assertPictureLinksHeld([link(video.key)], held)).toThrow(
      INVALID_MEDIA_KEY_MESSAGE,
    );
    expect(() =>
      assertPictureLinksHeld([link("media/x.png")], held, [
        link("media/x.png"),
      ]),
    ).not.toThrow();
  });
});
