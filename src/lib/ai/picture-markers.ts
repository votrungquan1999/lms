/** The question texts a model reply carries, where picture markers may sit. */
export interface MarkedQuestion {
  title: string;
  content: string;
  options?: { text: string; isCorrect: boolean }[];
  referenceAnswer?: string;
  explanation?: string;
}

/** `[image N]` in any letter case and spacing (never a line break), with the blanks that follow it. */
const MARKER = /\[[ \t]*image[ \t]*(\d+)[ \t]*\][ \t]*/gi;

/** Adjacent markers, so a run counts as one unit when deciding on spacing. */
const MARKER_RUN = /(?:\[[ \t]*image[ \t]*\d+[ \t]*\][ \t]*)+/gi;

/**
 * Lists the safe-integer picture numbers a text marks, in the order found.
 * @param text - Any text that may hold markers.
 * @returns The numbers, repeats included.
 */
function markedNumbers(text: string): number[] {
  return [...text.matchAll(MARKER)]
    .map((match) => Number(match[1]))
    .filter(Number.isSafeInteger);
}

/** The text without its markers, and the picture numbers they named. */
interface StrippedText {
  text: string;
  numbers: number[];
}

/** Tells whether a text holds a marker; the non-global twin of `MARKER`. */
const MARKER_TEST = /\[[ \t]*image[ \t]*\d+[ \t]*\]/i;

/** A letter or digit in any script, the characters a marker could glue together. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * Removes every marker from one text and lists the numbers they named.
 * @param text - A question text.
 * @returns The text and the marker numbers in the order found.
 */
function stripMarkers(text: string): StrippedText {
  // Numbers come from the original, since dropping a line loses its markers.
  const numbers = markedNumbers(text);
  if (!MARKER_TEST.test(text)) {
    return { text, numbers };
  }
  // A line holding nothing but markers is dropped whole, not left blank.
  const lines = text
    .split("\n")
    .filter(
      (line) =>
        line.replace(MARKER, "").trim() !== "" || !MARKER_TEST.test(line),
    )
    .map((line) =>
      MARKER_TEST.test(line)
        ? line
            .replace(MARKER_RUN, (run, offset: number, whole: string) => {
              // A run between two word characters must not fuse or split them.
              const before = whole[offset - 1] ?? "";
              const after = whole[offset + run.length] ?? "";
              return WORD_CHARACTER.test(before) && WORD_CHARACTER.test(after)
                ? " "
                : "";
            })
            // The removed marker's neighbours may leave trailing blanks.
            .replace(/[ \t]+$/, "")
        : line,
    );
  const withoutMarkers = lines.join("\n");
  return {
    text: withoutMarkers.replace(/\n(?:[ \t]*\n){2,}/g, "\n\n").trim(),
    numbers,
  };
}

/**
 * Names the pictures a marker-only text held, so it is not left empty.
 * @param numbers - The marker numbers that text held.
 * @returns A label such as "Picture 3", or "" when there were none.
 */
function pictureLabel(numbers: readonly number[]): string {
  const distinct = [...new Set(numbers)];
  if (distinct.length === 0) return "";
  if (distinct.length === 1) return `Picture ${distinct[0]}`;
  return `Pictures ${distinct.join(", ")}`;
}

/**
 * Takes the picture markers out of a question's title, content and options and
 * lists the document pictures they name.
 * @param question - A question whose texts may still hold `[image N]` markers.
 * @param documentNumbers - The picture numbers the document really has.
 * @returns The question without markers, plus the pictures it uses.
 */
export function readPictureMarkers<Q extends MarkedQuestion>(
  question: Q,
  documentNumbers: readonly number[],
): Q & { imageNumbers: number[] } {
  const found: number[] = [];
  const read = (text: string) => {
    const stripped = stripMarkers(text);
    found.push(...stripped.numbers);
    return stripped.text || pictureLabel(stripped.numbers);
  };
  const title = read(question.title);
  const content = read(question.content);
  const options = question.options?.map((option) => ({
    ...option,
    text: read(option.text),
  }));
  // An answer-key picture must never reach students, so these never attach.
  const answerKey = (text: string | undefined) => {
    if (text === undefined) return undefined;
    // Blank once its marker is gone: omit it rather than fail the import on it.
    return stripMarkers(text).text || undefined;
  };
  const referenceAnswer = answerKey(question.referenceAnswer);
  const explanation = answerKey(question.explanation);
  const imageNumbers = [...new Set(found)].filter((number) =>
    documentNumbers.includes(number),
  );
  return {
    ...question,
    title,
    content,
    ...(options && { options }),
    referenceAnswer,
    explanation,
    imageNumbers,
  };
}
