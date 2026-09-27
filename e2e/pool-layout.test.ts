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

  test("the Add Question success message sits below the form as a full-width line, not beside it", async ({
    page,
  }) => {
    const poolId = await withDb(async (db) => insertPool(db));

    await page.goto(`/admin/pools/${poolId}`);
    const formPanel = page
      .locator("form")
      .filter({ has: page.getByLabel("Question Title") });
    const widthBefore = (await formPanel.boundingBox())?.width;

    await page.getByLabel("Question Title").fill("[layout] Q1");
    await page.getByRole("button", { name: "Add Question" }).click();

    const banner = page.getByRole("status");
    await expect(banner).toBeVisible();
    // Row and banner boxes are both read here, after the click's own
    // auto-scroll has settled — comparing a pre-scroll box against a
    // post-scroll one would compare two different coordinate systems.
    const widthAfter = (await formPanel.boundingBox())?.width;
    const rowBox = await formPanel.locator("xpath=../..").boundingBox();
    const bannerBox = await banner.boundingBox();

    // The form panel's own width never changes because a message showing...
    expect(
      Math.abs((widthAfter ?? 0) - (widthBefore ?? 0)),
    ).toBeLessThanOrEqual(1);
    // ...and the banner renders below the sidebar+form row, as wide as it,
    // not as a full-height column squeezed in beside it.
    expect(bannerBox?.y).toBeGreaterThanOrEqual(
      (rowBox?.y ?? 0) + (rowBox?.height ?? 0) - 1,
    );
    expect(bannerBox?.width).toBeGreaterThanOrEqual((rowBox?.width ?? 0) - 1);
  });
});
