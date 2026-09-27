import { expect, test } from "@playwright/test";
import { insertCourse, insertTest, withDb } from "./seed";

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
});
