/**
 * Feature: leaving an AI import with work on screen (E2E)
 *
 * With a reviewed list on screen, a sidebar or breadcrumb link opens an in-app
 * "Leave this page?" dialog instead of navigating. Stay keeps the list; Leave
 * follows the link. An empty import page navigates with no dialog.
 */
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const COURSE_TITLE = "Leave Guard E2E Course";
const TEST_TITLE = "Leave Guard E2E Test";
const PICTURES_DOCX = path.join(__dirname, "fixtures", "pictures.docx");

async function openImportPage(page: Page) {
  await page.goto("/admin/courses");
  await page.getByText(COURSE_TITLE).click();
  await page.getByText(TEST_TITLE).click();
  await page.getByRole("link", { name: "Import Questions with AI" }).click();
  await expect(page).toHaveURL(/import-ai$/);
}

test.describe("AI Document Import — leave guard", () => {
  test.describe.configure({ mode: "serial" });

  test("setup: admin creates a course and a test", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For import-ai leave guard e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("a sidebar link asks first, Stay keeps the list, and a breadcrumb link leaves on Leave", async ({
    page,
  }) => {
    await openImportPage(page);
    await page.getByLabel(/document/i).setInputFiles(PICTURES_DOCX);
    await expect(page.getByAltText("Figure 1")).toBeVisible({ timeout: 20000 });
    const importUrl = page.url();

    // "Courses" is in both the sidebar and the breadcrumb, so scope each.
    await page
      .locator('[data-sidebar="sidebar"]')
      .getByRole("link", { name: "Courses" })
      .click();
    await expect(
      page.getByRole("alertdialog", { name: "Leave this page?" }),
    ).toBeVisible();
    expect(page.url()).toBe(importUrl);

    await page.getByRole("button", { name: "Stay" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByAltText("Figure 1")).toBeVisible();
    expect(page.url()).toBe(importUrl);

    await page
      .getByRole("navigation", { name: "breadcrumb" })
      .getByRole("link", { name: TEST_TITLE })
      .click();
    await expect(
      page.getByRole("alertdialog", { name: "Leave this page?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Leave" }).click();
    await expect(
      page.getByRole("heading", { name: TEST_TITLE, level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/tests\/[^/]+$/);

    // Leaving clears the guard, so the next link navigates with no dialog.
    await page
      .locator('[data-sidebar="sidebar"]')
      .getByRole("link", { name: "Courses" })
      .click();
    await expect(page).toHaveURL(/\/admin\/courses$/);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("an empty import page lets a sidebar link navigate with no dialog", async ({
    page,
  }) => {
    await openImportPage(page);

    await page
      .locator('[data-sidebar="sidebar"]')
      .getByRole("link", { name: "Courses" })
      .click();

    await expect(page).toHaveURL(/\/admin\/courses$/);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });
});
