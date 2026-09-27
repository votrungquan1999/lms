import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectNotClipped, insertStudent, withDb } from "./seed";

// Must match e2e/auth.setup.ts's ADMIN_EMAIL — the row under test is the
// signed-in admin's own row, whose "Revoke admin" is always refused.
const ADMIN_EMAIL = "votrungquan99@gmail.com";

const userRow = (page: Page, email: string) =>
  page.locator('[data-testid^="user-role-row-"]').filter({ hasText: email });

/** Renames the signed-in admin and returns the previous name. */
async function renameAdmin(name: string): Promise<string> {
  return withDb(async (db) => {
    const users = db.collection<{ email: string; name: string }>("user");
    const admin = await users.findOne({ email: ADMIN_EMAIL });
    if (!admin) throw new Error(`No ${ADMIN_EMAIL} user — did auth.setup run?`);
    await users.updateOne({ email: ADMIN_EMAIL }, { $set: { name } });
    return admin.name;
  });
}

test.describe("People layout", () => {
  test("an unbroken student name and username never overflow their card", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenName =
      "[layout] averylongunbrokenstudentnamethatshouldwrapinsteadofoverflowing1234567890";
    const unbrokenUsername = "layoutaverylongunbrokenusername1234567890";
    await withDb((db) =>
      insertStudent(db, { name: unbrokenName, username: unbrokenUsername }),
    );

    await page.goto("/admin/students");
    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: unbrokenName });
    await expect(card.getByText(unbrokenName, { exact: true })).toBeVisible();
    await expect(
      card.getByText(`@${unbrokenUsername}`, { exact: true }),
    ).toBeVisible();
    await expectNotClipped(card);
  });

  test("the admin's own role badge does not shift when a self-revoke is refused, and a long name never overflows the row", async ({
    page,
  }) => {
    // No hyphens: browsers treat "-" as a soft break point even without a
    // wrap utility, so a hyphenated string would not reproduce the overflow.
    const unbrokenName =
      "[layout] averylongunbrokenadminnamethatshouldwrapinsteadofoverflowing1234567890";
    // Every spec in the run shares this admin, so its real name goes back.
    const originalName = await renameAdmin(unbrokenName);
    try {
      await page.goto("/admin/user-roles");
      const ownRow = userRow(page, ADMIN_EMAIL);
      await expect(
        ownRow.getByText(unbrokenName, { exact: true }),
      ).toBeVisible();
      await expectNotClipped(ownRow);

      const badge = ownRow.locator('[data-slot="badge"]');
      const before = await badge.boundingBox();
      if (!before) throw new Error("Admin badge not found before the click");

      await ownRow.getByRole("button", { name: "Revoke admin" }).click();
      const alert = ownRow.getByRole("alert");
      await expect(alert).toBeVisible();

      const after = await badge.boundingBox();
      if (!after) throw new Error("Admin badge not found after the click");
      expect(after.x).toBeCloseTo(before.x, 0);

      // The error is a full-width line under the row, not squeezed into the
      // narrow action slot — its left edge lines up with the row's own name.
      const nameBox = await ownRow
        .getByText(unbrokenName, { exact: true })
        .boundingBox();
      if (!nameBox) throw new Error("Admin name not found");
      const alertBox = await alert.boundingBox();
      if (!alertBox) throw new Error("Alert not found");
      expect(alertBox.x).toBeCloseTo(nameBox.x, 0);
    } finally {
      await renameAdmin(originalName);
    }
  });

  test("role badges line up across rows even though each row's button label differs", async ({
    page,
  }) => {
    // No role key reads as Student, so this row offers the narrower "Make admin".
    const studentEmail = `layout-${crypto.randomUUID().slice(0, 8)}@lms.internal`;
    await withDb((db) =>
      db
        .collection("user")
        .insertOne({ email: studentEmail, name: "[layout] Role Student" }),
    );

    await page.goto("/admin/user-roles");
    const adminRow = userRow(page, ADMIN_EMAIL);
    const studentRow = userRow(page, studentEmail);
    await expect(
      adminRow.getByRole("button", { name: "Revoke admin" }),
    ).toBeVisible();
    await expect(
      studentRow.getByRole("button", { name: "Make admin" }),
    ).toBeVisible();

    // Badges are right-aligned, and "Admin"/"Student" differ in width, so compare right edges.
    const rightEdge = async (row: Locator) => {
      const box = await row.locator('[data-slot="badge"]').boundingBox();
      if (!box) throw new Error("Role badge not found");
      return box.x + box.width;
    };
    expect(await rightEdge(studentRow)).toBeCloseTo(
      await rightEdge(adminRow),
      0,
    );
  });
});
