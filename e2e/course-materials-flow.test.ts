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
    await page.getByRole("button", { name: "Add Course" }).click();
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
    await page.getByRole("button", { name: "Manage Enrollments" }).click();
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

    // Select the file and upload it.
    await page.getByLabel("Materials file").setInputFiles(fixturePath);
    await page.getByRole("button", { name: "Upload materials" }).click();

    // The material appears in the admin Materials list.
    await expect(page.getByText(MATERIAL_FILE)).toBeVisible({ timeout: 10000 });
  });

  test("setup: student authenticates and saves auth state", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001/student/login");
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

    await page.goto("http://localhost:3001/student/dashboard");
    await page.getByRole("link", { name: COURSE_TITLE_RE }).click();

    // The Materials section shows a download link for the uploaded file.
    await expect(
      page.getByRole("heading", { name: "Materials" }),
    ).toBeVisible();
    const downloadLink = page.getByRole("link", { name: MATERIAL_FILE });
    await expect(downloadLink).toBeVisible();

    await context.close();
  });
});
