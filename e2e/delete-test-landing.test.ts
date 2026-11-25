import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";
import { insertCourse, insertTest, withDb } from "./seed";

test.describe("Deleting a test from its own page", () => {
  test("lands the teacher on the course page with the other tests still listed", async ({
    page,
  }) => {
    const courseTitle = `[landing] Course ${crypto.randomUUID()}`;
    const doomedTitle = `[landing] Doomed ${crypto.randomUUID()}`;
    const keptTitle = `[landing] Kept ${crypto.randomUUID()}`;
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db, { title: courseTitle });
      const testId = await insertTest(db, courseId, { title: doomedTitle });
      await insertTest(db, courseId, { title: keptTitle });
      return { courseId, testId };
    });

    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);
    const deleteButton = page.getByRole("button", { name: "Delete Test" });
    await expect(deleteButton).toBeVisible();
    await hydrated(deleteButton);
    await deleteButton.click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/courses/${courseId}$`));
    await expect(
      page.getByRole("heading", { name: courseTitle }),
    ).toBeVisible();
    await expect(page.getByText(keptTitle)).toBeVisible();
    await expect(page.getByText(doomedTitle)).toHaveCount(0);
    await expect(page.getByText("This page could not be found.")).toHaveCount(
      0,
    );
  });
});
