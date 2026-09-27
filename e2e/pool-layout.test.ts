import { expect, test } from "@playwright/test";
import { expectNoPageOverflow, insertPool, withDb } from "./seed";

test.describe("Pool layout", () => {
  test("an unbroken pool name or description never forces the page to scroll sideways", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenName = `[layout] averylongunbrokenpoolnamethatshouldwrapinsteadofoverflowingthepage1234567890@example.com`;
    // ~190 characters: wider than the content column even at the description's small size.
    const unbrokenDescription = "averylongunbrokenpooldescription".repeat(6);
    const poolId = await withDb((db) =>
      insertPool(db, { name: unbrokenName, description: unbrokenDescription }),
    );

    await page.goto(`/admin/pools/${poolId}`);
    await expect(
      page.getByRole("heading", { name: unbrokenName }),
    ).toBeVisible();
    await expect(
      page.getByText(unbrokenDescription, { exact: true }),
    ).toBeVisible();

    await expectNoPageOverflow(page);
  });
});
