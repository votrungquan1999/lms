import {
  formatPictureLink,
  linkKeysIn,
  linksToMarkers,
  markerKeysFor,
  markersToLinks,
  PICTURE_REMOVED_TEXT,
  resolvePictureLinks,
} from "src/lib/picture-links";
import { describe, expect, it } from "vitest";

const media = [
  { key: "media/b.png", contentType: "image/png", order: 1 },
  { key: "media/v.mp4", contentType: "video/mp4", order: 0 },
  { key: "media/a.png", contentType: "image/png", order: 2 },
];

describe("resolvePictureLinks", () => {
  it("shows each link as Picture k over pictures only, in saved order, and a gone picture as removed", () => {
    const a = formatPictureLink("media/a.png");
    const b = formatPictureLink("media/b.png");
    const gone = formatPictureLink("media/gone.png");

    expect(resolvePictureLinks(`Look at ${a} and ${b}`, media)).toBe(
      "Look at Picture 2 and Picture 1",
    );
    expect(resolvePictureLinks(`${b}${a}`, media)).toBe("Pictures 1, 2");
    expect(resolvePictureLinks(a, media)).toBe("Picture 2");
    expect(resolvePictureLinks(`See ${gone}`, media)).toBe(
      "See (picture removed)",
    );
    expect(resolvePictureLinks("Picture 3 stays", media)).toBe(
      "Picture 3 stays",
    );
  });
});

describe("link and marker mapping", () => {
  it("round-trips a text through markers byte-for-byte and leaves unknown ones", () => {
    const keys = new Map([["media/a.png", 2]]);
    const text = `See ${formatPictureLink("media/a.png")} and ${formatPictureLink("media/x.png")}`;

    const typed = linksToMarkers(text, keys);

    expect(typed).toBe(`See [image 2] and ${formatPictureLink("media/x.png")}`);
    expect(markersToLinks(typed, new Map([[2, "media/a.png"]]))).toBe(text);
    expect(markersToLinks("[image 9]", new Map())).toBe("[image 9]");
    expect(linkKeysIn(text)).toEqual(["media/a.png", "media/x.png"]);
  });
});

describe("resolvePictureLinks for a text made only of links", () => {
  it("falls back to per-link wording when one linked picture is gone", () => {
    const a = formatPictureLink("media/a.png");
    const gone = formatPictureLink("media/gone.png");

    expect(resolvePictureLinks(`${a}${gone}`, media)).toBe(
      `Picture 2${PICTURE_REMOVED_TEXT}`,
    );
  });

  it("names a picture linked twice only once", () => {
    const a = formatPictureLink("media/a.png");

    expect(resolvePictureLinks(`${a}${a}`, media)).toBe("Picture 2");
  });
});

describe("markerKeysFor", () => {
  it("numbers new pictures after the kept ones, skipping videos", () => {
    const open = new Map([
      ["media/a.png", 1],
      ["media/b.png", 2],
    ]);

    const keys = markerKeysFor(open, [
      { key: "media/v.mp4", contentType: "video/mp4" },
      { key: "media/new.png", contentType: "image/png" },
    ]);

    expect(keys.get(3)).toBe("media/new.png");
    expect(keys.get(1)).toBe("media/a.png");
  });
});
