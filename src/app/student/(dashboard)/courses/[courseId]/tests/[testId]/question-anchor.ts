/**
 * Page anchor of a question's card, shared by the card and the navigator box
 * that links to it.
 * @param order - The question's number on the test.
 * @returns The element id, e.g. "question-3".
 */
export function questionAnchorId(order: number): string {
  return `question-${order}`;
}
