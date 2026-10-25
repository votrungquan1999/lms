import { screen } from "@testing-library/react";

/**
 * Finds one question's review card by its title.
 * @param title - The question's title.
 * @returns The card element.
 */
export function questionCard(title: string): HTMLElement {
  return screen.getByText(title).closest('[data-slot="card"]') as HTMLElement;
}
