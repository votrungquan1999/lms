import { expect, test } from "@playwright/test";
import { expectNotClipped, insertCourse, insertStudent, withDb } from "./seed";

test.describe("Course layout", () => {
  test("unbroken student names never overflow the Manage Enrollments dialog", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenName =
      "[layout] averylongunbrokenenrollmentnamethatshouldwrapinsteadofoverflowing1234567890@example.com";
    const unbrokenUsername =
      "layoutenrollaverylongunbrokenusernamethatshouldwrap1234567890";
    const courseId = await withDb(async (db) => {
      await insertStudent(db, {
        name: unbrokenName,
        username: unbrokenUsername,
      });
      return insertCourse(db, { title: "[layout] Enrollment Course" });
    });

    await page.goto(`/admin/courses/${courseId}`);
    await page.getByRole("button", { name: "Manage Enrollments" }).click();

    const dialog = page.getByRole("dialog", { name: "Manage Enrollments" });
    await expect(dialog.getByText(unbrokenName, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(`@${unbrokenUsername}`, { exact: true }),
    ).toBeVisible();
    await expectNotClipped(dialog);
  });
});
