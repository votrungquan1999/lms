import { expect, type Locator } from "@playwright/test";

/** Waits for React to hydrate the element; an earlier click would submit a form natively and drop what was typed. */
export async function hydrated(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((node) =>
        Object.keys(node).some((key) => key.startsWith("__reactFiber$")),
      ),
    )
    .toBe(true);
}
