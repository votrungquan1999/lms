/** A media entry as far as picture links care: its key, kind and place. */
export interface LinkableMedia {
  key: string;
  contentType: string;
  order: number;
}

/** The text shown where a link names a picture the question no longer holds. */
export const PICTURE_REMOVED_TEXT = "(picture removed)";

/** A stored link; braces are inert in markdown and plain text. */
const LINK = /\{\{picture:([^{}\s]+)\}\}/g;

/** An `[image N]` marker as typed in an Edit modal (no trailing blanks taken). */
const TYPED_MARKER = /\[[ \t]*image[ \t]*(\d+)[ \t]*\]/gi;

/**
 * Writes the stored link to one specific picture.
 * @param key - The picture's media storage key.
 * @returns The link text kept in a question's title, content or option.
 */
export function formatPictureLink(key: string): string {
  return `{{picture:${key}}}`;
}

/**
 * Lists the media keys a text links, repeats included.
 * @param text - Any stored question text.
 * @returns The keys in the order found.
 */
export function linkKeysIn(text: string): string[] {
  return [...text.matchAll(LINK)].map((match) => match[1]);
}

/**
 * Numbers a question's pictures the way students see them: 1-based over
 * pictures only (videos skipped), in saved order.
 * @param media - The question's media.
 * @returns Each picture's key mapped to its number.
 */
export function pictureNumbersByKey(
  media: readonly LinkableMedia[],
): Map<string, number> {
  const pictures = [...media]
    .sort((a, b) => a.order - b.order)
    .filter((entry) => !entry.contentType.startsWith("video/"));
  return new Map(pictures.map((entry, index) => [entry.key, index + 1]));
}

/**
 * Shows a stored text the way students see it: each link as "Picture k" from
 * the current picture order, or "(picture removed)" when its picture is gone.
 * @param text - A stored title, content or option text.
 * @param media - The question's media.
 * @returns The text with links resolved; text without links is returned as is.
 */
export function resolvePictureLinks(
  text: string,
  media: readonly LinkableMedia[],
): string {
  if (!text.includes("{{picture:")) return text;
  const numbers = pictureNumbersByKey(media);
  const keys = linkKeysIn(text);
  // A text that is only links reads "Pictures 1, 3" when every picture exists.
  const linksOnly = keys.length > 0 && text.replace(LINK, "").trim() === "";
  if (linksOnly && keys.every((key) => numbers.has(key))) {
    const places = [...new Set(keys.map((key) => numbers.get(key) as number))];
    return places.length === 1
      ? `Picture ${places[0]}`
      : `Pictures ${places.join(", ")}`;
  }
  return text.replace(LINK, (_link, key: string) => {
    const place = numbers.get(key);
    return place === undefined ? PICTURE_REMOVED_TEXT : `Picture ${place}`;
  });
}

/**
 * Turns stored links into the `[image N]` markers an Edit modal shows.
 * @param text - A stored text.
 * @param numbers - Each picture key's number at the time the modal opened.
 * @returns The text with known links as markers; unknown links stay raw.
 */
export function linksToMarkers(
  text: string,
  numbers: ReadonlyMap<string, number>,
): string {
  return text.replace(LINK, (link, key: string) => {
    const place = numbers.get(key);
    return place === undefined ? link : `[image ${place}]`;
  });
}

/**
 * Turns the `[image N]` markers typed in an Edit modal back into stored links.
 * @param text - A modal text.
 * @param keys - The picture key for each marker number.
 * @returns The text with known markers as links; unknown numbers stay as typed.
 */
export function markersToLinks(
  text: string,
  keys: ReadonlyMap<number, string>,
): string {
  return text.replace(TYPED_MARKER, (marker, digits: string) => {
    const key = keys.get(Number(digits));
    return key === undefined ? marker : formatPictureLink(key);
  });
}

/**
 * Converts a modal text to stored form only when the teacher changed it; an
 * untouched text keeps the stored bytes, so older text that literally says
 * "[image 1]" is never rewritten into a link.
 * @param text - The text now in the modal field.
 * @param shownAtOpen - The text the field showed when the modal opened.
 * @param stored - The text as stored.
 * @param keys - The picture key for each marker number.
 * @returns The stored text when unchanged, otherwise the text with markers as links.
 */
export function storedTextIfUnchanged(
  text: string,
  shownAtOpen: string,
  stored: string,
  keys: ReadonlyMap<number, string>,
): string {
  return text === shownAtOpen ? stored : markersToLinks(text, keys);
}

/** The question texts picture links can sit in. */
export interface LinkableTexts {
  title: string;
  content: string;
  options?: { text: string }[];
}

/**
 * Applies one text transform to a question's title, content and option texts.
 * @param question - Any question or Question Bank question.
 * @param transform - Maps one stored text to another.
 * @returns A copy with every text transformed; nothing else changes.
 */
export function mapQuestionTexts<Q extends LinkableTexts>(
  question: Q,
  transform: (text: string) => string,
): Q {
  const mapped: Q = {
    ...question,
    title: transform(question.title),
    content: transform(question.content),
  };
  if (question.options) {
    mapped.options = question.options.map((option) => ({
      ...option,
      text: transform(option.text),
    }));
  }
  return mapped;
}

/**
 * Shows a question's saved texts the way students see them.
 * @param question - A question holding raw stored texts and its media.
 * @returns A copy whose links read "Picture k" or "(picture removed)".
 */
export function resolveQuestionLinks<
  Q extends LinkableTexts & { media: readonly LinkableMedia[] },
>(question: Q): Q {
  return mapQuestionTexts(question, (text) =>
    resolvePictureLinks(text, question.media),
  );
}

/**
 * Maps each `[image N]` number a teacher can type to its picture key: the
 * pictures the modal opened with, then new uploads numbered above them.
 * @param openNumbers - Each opening picture key's number.
 * @param uploaded - The files uploaded by this save, in picked order.
 * @returns The key for each typed number.
 */
export function markerKeysFor(
  openNumbers: ReadonlyMap<string, number>,
  uploaded: readonly { key: string; contentType: string }[],
): Map<number, string> {
  const keys = new Map([...openNumbers].map(([key, n]) => [n, key]));
  let next = Math.max(0, ...openNumbers.values()) + 1;
  for (const file of uploaded) {
    if (!file.contentType.startsWith("video/")) keys.set(next++, file.key);
  }
  return keys;
}

/**
 * Lists the `[image N]` numbers an open Edit modal can still name: the kept
 * pictures' opening numbers, then one new number per picked picture.
 * @param keptKeys - Keys of the pictures the teacher keeps.
 * @param openNumbers - Each opening picture key's number.
 * @param newPictureCount - How many picked files are pictures (not videos).
 * @returns The numbers held.
 */
export function heldPictureNumbers(
  keptKeys: readonly string[],
  openNumbers: ReadonlyMap<string, number>,
  newPictureCount: number,
): number[] {
  const first = Math.max(0, ...openNumbers.values()) + 1;
  return [
    ...keptKeys.flatMap((key) => openNumbers.get(key) ?? []),
    ...Array.from({ length: newPictureCount }, (_, i) => first + i),
  ];
}
