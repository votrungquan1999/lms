import { expect, test } from "@playwright/test";
import {
  expectNoPageOverflow,
  expectNotClipped,
  expectWrapped,
  insertCourse,
  insertTest,
  withDb,
} from "./seed";

test.describe("Grading layout", () => {
  test("hub cards have a visible gap between them, and an unbroken test title stays inside its own card", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    // Long enough to wrap even across the hub's full-width card.
    const unbrokenTitle = `[layout] averylongunbrokenhubtitle${"thatshouldwrapinsteadofoverflowing".repeat(4)}`;
    // The hub sorts by course title; a shared random tag keeps A and B
    // adjacent even on a re-run, so the gap measured is the one between them.
    const tag = crypto.randomUUID().slice(0, 8);
    const { testAId, testBId } = await withDb(async (db) => {
      const courseAId = await insertCourse(db, {
        title: `[layout] Grading Hub ${tag} A`,
      });
      const testAId = await insertTest(db, courseAId, {
        title: "[layout] Short Hub Test",
      });
      const courseBId = await insertCourse(db, {
        title: `[layout] Grading Hub ${tag} B`,
      });
      const testBId = await insertTest(db, courseBId, {
        title: unbrokenTitle,
      });
      return { testAId, testBId };
    });

    await page.goto("/admin/grading?filter=all");
    const cardA = page.getByTestId(`hub-test-card-${testAId}`);
    const cardB = page.getByTestId(`hub-test-card-${testBId}`);
    const [boxA, boxB] = await Promise.all([
      cardA.boundingBox(),
      cardB.boundingBox(),
    ]);
    if (!boxA || !boxB) throw new Error("Hub cards not found");

    const [top, bottom] = boxA.y <= boxB.y ? [boxA, boxB] : [boxB, boxA];
    expect(bottom.y - (top.y + top.height)).toBeGreaterThanOrEqual(8);

    await expect(cardB.getByText(unbrokenTitle, { exact: true })).toBeVisible();
    await expectWrapped(cardB.getByText(unbrokenTitle, { exact: true }));
    await expectNotClipped(cardB);
  });

  test("a released test's unbroken title never forces either grading page to scroll sideways", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenTitle =
      "[layout] averylongunbrokentitlethatshouldwrapinsteadofoverflowingthepage1234567890@example.com";
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db);
      const testId = await insertTest(db, courseId, {
        title: unbrokenTitle,
        gradesReleasedAt: new Date(),
      });
      return { courseId, testId };
    });

    await page.goto(`/admin/grading/${testId}`);
    await expect(
      page.getByRole("heading", { name: `Grade: ${unbrokenTitle}` }),
    ).toBeVisible();
    await expectNoPageOverflow(page);

    await page.goto(`/admin/courses/${courseId}/tests/${testId}/grading`);
    await expect(
      page.getByRole("heading", { name: `Grade: ${unbrokenTitle}` }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
