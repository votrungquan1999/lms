import { markerOnlyNumbers } from "src/lib/ai/picture-markers";

/** The question texts that may name pictures by marker alone. */
interface ReferencingFields {
  title: string;
  content: string;
  options?: { text: string }[];
}

/** The first text naming a picture its question does not hold. */
export interface MissingPictureReference {
  /** Leads a sentence, such as "Option 2" or "The title". */
  label: string;
  /** The kind of field, such as "option" or "title". */
  field: string;
}

/**
 * Shows a text that is only picture markers by the names students see:
 * "Picture k", k being the picture's place among the question's pictures.
 * Any other text, or one naming a picture the question does not hold, is
 * returned as written.
 * @param text - A title, content or choice text.
 * @param pictureNumbers - The `[image N]` numbers of the question's pictures, in the order shown.
 * @returns Such as "Picture 1" or "Pictures 1, 3", or the text unchanged.
 */
export function pictureReferenceText(
  text: string,
  pictureNumbers: readonly number[],
): string {
  const named = markerOnlyNumbers(text);
  if (!named) return text;
  const places = named.map((number) => pictureNumbers.indexOf(number) + 1);
  if (places.includes(0)) return text;
  return places.length === 1
    ? `Picture ${places[0]}`
    : `Pictures ${places.join(", ")}`;
}

/**
 * The note an edit field shows under a text that is only picture markers.
 * @param text - The field's text as typed.
 * @param pictureNumbers - The `[image N]` numbers of the question's pictures, in the order shown.
 * @returns Such as "Shows as Picture 1", or null for any other text.
 */
export function pictureReferenceHint(
  text: string,
  pictureNumbers: readonly number[],
): string | null {
  if (!markerOnlyNumbers(text)) return null;
  const shown = pictureReferenceText(text, pictureNumbers);
  return shown === text
    ? "Names a picture this question does not have"
    : `Shows as ${shown}`;
}

/**
 * Finds the first text that is only markers yet names a picture the question
 * does not hold, such as after the picture was moved to another question.
 * @param question - The question's texts.
 * @param pictureNumbers - The `[image N]` numbers of the question's pictures, in the order shown.
 * @returns That text's field, or null when every reference resolves.
 */
export function missingPictureReference(
  question: ReferencingFields,
  pictureNumbers: readonly number[],
): MissingPictureReference | null {
  const fields: (MissingPictureReference & { text: string })[] = [
    { label: "The title", field: "title", text: question.title },
    { label: "The content", field: "content", text: question.content },
    ...(question.options ?? []).map((option, index) => ({
      label: `Option ${index + 1}`,
      field: "option",
      text: option.text,
    })),
  ];
  const missing = fields.find(
    ({ text }) =>
      markerOnlyNumbers(text) !== null &&
      pictureReferenceText(text, pictureNumbers) === text,
  );
  return missing ? { label: missing.label, field: missing.field } : null;
}
