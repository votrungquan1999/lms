import { expect, test } from "@playwright/test";
import {
  expectNoPageOverflow,
  expectWrapped,
  insertCourse,
  insertPool,
  insertPoolQuestion,
  insertTest,
  withDb,
} from "./seed";

test.describe("Test page layout", () => {
  test("an unbroken test title never pushes the Delete Test button off the test page", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenTitle =
      "[layout] averylongunbrokentesttitlethatshouldwrapinsteadofoverflowing1234567890";
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId, { title: unbrokenTitle });
      return { courseId, testId };
    });

    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);
    await expect(
      page.getByRole("heading", { name: unbrokenTitle }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete Test" }),
    ).toBeInViewport({ ratio: 1 });
  });

  test("the Add from Pools card uses the full available width of the test page", async ({
    page,
  }) => {
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      return { courseId, testId };
    });

    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);
    const { cardWidth, availableWidth } = await page.evaluate(() => {
      const heading = [
        ...document.querySelectorAll('[data-slot="card-title"]'),
      ].find((el) => el.textContent === "Add from Pools");
      if (!heading) throw new Error("Add from Pools card not found");
      const card = heading.closest('[data-slot="card"]') as HTMLElement;
      // The page's root content div — unconstrained by the section's own cap.
      const outer = document.querySelector("main > div") as HTMLElement;
      const outerStyle = getComputedStyle(outer);
      const paddingX =
        Number.parseFloat(outerStyle.paddingLeft) +
        Number.parseFloat(outerStyle.paddingRight);
      return {
        cardWidth: card.getBoundingClientRect().width,
        availableWidth: outer.getBoundingClientRect().width - paddingX,
      };
    });

    expect(Math.abs(cardWidth - availableWidth)).toBeLessThanOrEqual(1);
  });

  test("an unbroken pool name never crushes its row in Add from Pools", async ({
    page,
  }) => {
    // ~2x the widest container, so a later widening can't silently hollow
    // this; the pool list is global, so a random tag keeps re-runs distinct.
    const tag = crypto.randomUUID().slice(0, 8);
    const unbrokenName = `[layout] averylongunbrokenpoolname${tag}${"thatshouldwrapinsteadofcrushingtherow".repeat(5)}`;
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      await insertPool(db, { name: unbrokenName });
      return { courseId, testId };
    });

    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);
    const row = page.getByTestId("compose-pool-row").filter({
      hasText: unbrokenName,
    });

    // The unbroken name wraps inside the row instead of crushing it...
    await expectWrapped(row.getByText(unbrokenName));
    await expectNoPageOverflow(page);

    // ...while the availability text stays on one line.
    const { availableHeight, availableLineHeight } = await row
      .getByText(/available\)$/)
      .evaluate((el) => ({
        availableHeight: el.getBoundingClientRect().height,
        availableLineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
      }));
    expect(availableHeight).toBeLessThanOrEqual(availableLineHeight * 1.2);
  });

  test("only a pool with no questions is muted in Add from Pools", async ({
    page,
  }) => {
    // The pool list is global, so a random tag keeps re-runs distinct.
    const tag = crypto.randomUUID().slice(0, 8);
    const filledName = `[layout] ${tag} Filled pool`;
    const emptyName = `[layout] ${tag} Empty pool`;
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId);
      const filledPoolId = await insertPool(db, { name: filledName });
      await insertPoolQuestion(db, filledPoolId);
      await insertPool(db, { name: emptyName });
      return { courseId, testId };
    });

    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);
    const opacityOf = (name: string) =>
      page
        .getByTestId("compose-pool-row")
        .filter({ hasText: name })
        .evaluate((el) => getComputedStyle(el).opacity);

    // An unticked pool that has questions reads at full strength...
    expect(await opacityOf(filledName)).toBe("1");
    // ...and only the empty one is muted.
    expect(await opacityOf(emptyName)).toBe("0.5");
  });
});
