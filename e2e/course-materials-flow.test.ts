/**
 * Feature: Course materials (E2E)
 *
 * An admin uploads a downloadable file to a course; an enrolled student then
 * sees it in the course's Materials section and can download it.
 *
 * Self-contained — creates its own student, course, and enrollment via the UI.
 *
 * NOTE on S3: the browser→S3 presigned PUT is intercepted with `page.route`
 * (returns 200) so the upload succeeds without a live bucket. The server-side
 * presign (requestMaterialUploadSlotsAction) still requires the `dev:e2e`
 * server to have S3 credentials configured; if it does not, the upload step
 * cannot run and this spec should be skipped in that environment.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectNoPageOverflow } from "./seed";

const STUDENT_NAME = "Materials Student";
const STUDENT_USERNAME = "materials-student";
const STUDENT_PASSWORD = "materials-student-password";
const COURSE_TITLE = "Materials E2E Course";
const COURSE_TITLE_RE = /Materials E2E Course/;
const MATERIAL_FILE = "test-material.pdf";

const authDir = path.join(__dirname, "../playwright/.auth");
const fixturePath = path.join(__dirname, "fixtures", MATERIAL_FILE);

test.describe("Course Materials Flow", () => {
  test.describe.configure({ mode: "serial" });

  // Intercept the browser→S3 presigned PUT so uploads succeed without a bucket.
  test.beforeEach(async ({ page }) => {
    await page.route(
      (url) => url.href.includes("s3") || url.href.includes("amazonaws"),
      (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({ status: 200, body: "" })
          : route.continue(),
    );
  });

  test("setup: admin creates a student account", async ({ page }) => {
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("setup: admin creates a course and enrolls the student", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "New course" }).first().click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For materials e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(
      page.getByRole("heading", { name: COURSE_TITLE }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Course sections" })
      .getByRole("link", { name: "Students" })
      .click();
    await page.getByRole("button", { name: "Add students" }).click();
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(page.getByText("updated")).toBeVisible({ timeout: 10000 });
  });

  test("admin uploads a material and sees it listed", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(
      page.getByRole("heading", { name: COURSE_TITLE }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Course sections" })
      .getByRole("link", { name: "Materials" })
      .click();

    // Select the file and upload it.
    await page.getByLabel("Materials file").setInputFiles(fixturePath);
    await page.getByRole("button", { name: "Upload materials" }).click();

    // The material appears in the admin Materials list as a download link —
    // NOT `getByText(MATERIAL_FILE)`, which also matches the file picker's own
    // "selected file" preview and is satisfied before the upload even starts,
    // letting the test finish (and Playwright tear down the page) while the
    // persist request is still in flight server-side.
    await expect(page.getByRole("link", { name: MATERIAL_FILE })).toBeVisible({
      timeout: 10000,
    });

    // The row carries the file's size and its upload date in Vietnam time.
    const row = page.getByRole("row", { name: new RegExp(MATERIAL_FILE) });
    await expect(row.getByRole("cell").nth(1)).toHaveText(
      /^\d+(\.\d)? (B|KB|MB)$/,
    );
    const today = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    })
      .format(new Date())
      .replace(/^(\w+) (\d+), (\d+)$/, "$2 $1 $3");
    await expect(row.getByRole("cell").nth(2)).toHaveText(today);
    await expect(
      row.getByRole("link", { name: `Download ${MATERIAL_FILE}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Materials (1)" }),
    ).toBeVisible();
  });

  test("on a phone each material stacks its name, size · date and buttons, with no sideways scroll", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page
      .getByRole("navigation", { name: "Course sections" })
      .getByRole("link", { name: "Materials" })
      .click();
    const download = page.getByRole("link", {
      name: `Download ${MATERIAL_FILE}`,
    });
    await expect(download).toBeVisible();

    // When the window is a phone
    await page.setViewportSize({ width: 390, height: 800 });

    // Then the column headers give way to stacked lines, all in view
    await expect(page.getByRole("columnheader", { name: "Size" })).toBeHidden();
    const remove = page.getByRole("button", {
      name: `Remove ${MATERIAL_FILE}`,
    });
    await expect(download).toBeInViewport({ ratio: 1 });
    await expect(remove).toBeInViewport({ ratio: 1 });
    await expectNoPageOverflow(page);

    // And the lines read name, then size · date, then the buttons
    const cells = page.locator("tr", { hasText: MATERIAL_FILE }).locator("td");
    const name = await cells.nth(0).boundingBox();
    const size = await cells.nth(1).boundingBox();
    const date = await cells.nth(2).boundingBox();
    const button = await download.boundingBox();
    expect(size?.y).toBeGreaterThanOrEqual(
      (name?.y ?? 0) + (name?.height ?? 0),
    );
    expect(Math.abs((date?.y ?? 0) - (size?.y ?? 0))).toBeLessThan(2);
    expect(button?.y).toBeGreaterThanOrEqual(
      (size?.y ?? 0) + (size?.height ?? 0),
    );
  });

  test("setup: student authenticates and saves auth state", async ({
    browser,
  }) => {
    // storageState: undefined avoids inheriting the project's admin session
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/student/login");
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/student/dashboard", { timeout: 10000 });

    fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({
      path: path.join(authDir, "materials-student.json"),
    });
    await context.close();
  });

  test("student sees the material and can download it", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, "materials-student.json"),
    });
    const page = await context.newPage();
    await page.route(
      (url) => url.href.includes("s3") || url.href.includes("amazonaws"),
      (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({ status: 200, body: "" })
          : route.continue(),
    );

    await page.goto("/student/dashboard");
    // Scoped to "Your courses" — the sidebar nav repeats the same title,
    // which is otherwise a strict-mode violation.
    const yourCourses = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Your courses" }) });
    await yourCourses.getByRole("link", { name: COURSE_TITLE_RE }).click();

    // The Materials section shows a download link for the uploaded file.
    await expect(
      page.getByRole("heading", { name: "Materials" }),
    ).toBeVisible();
    const downloadLink = page.getByRole("link", { name: MATERIAL_FILE });
    await expect(downloadLink).toBeVisible();

    await context.close();
  });

  test("admin removes the material and sees the empty list", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page
      .getByRole("navigation", { name: "Course sections" })
      .getByRole("link", { name: "Materials" })
      .click();
    await expect(page.getByRole("link", { name: MATERIAL_FILE })).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("No materials yet.")).toBeVisible({
      timeout: 10000,
    });
  });
});
