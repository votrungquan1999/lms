/**
 * Feature: Image-answer questions + grader annotation (E2E)
 *
 * A student uploads a photo of handwritten work as their answer; a grader views
 * the photo, draws an annotation over it and saves; once the grade is revealed
 * the student sees the grader's annotation on their photo.
 *
 * Self-contained — creates its own student, course, test, and image-answer
 * question via the UI.
 *
 * NOTE on S3: the browser→S3 presigned PUT is intercepted with `page.route`
 * (returns 200) so uploads succeed without a live bucket. The server-side
 * presign still requires the `dev:e2e` server to have S3 credentials; skip this
 * spec in environments without them. The grader's freehand draw is simulated
 * with mouse down/move/up over the "Drawing surface" SVG.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const STUDENT_NAME = "Annotation Student";
const STUDENT_USERNAME = "annotation-student";
const STUDENT_PASSWORD = "annotation-student-password";
const COURSE_TITLE = "Annotation E2E Course";
const COURSE_TITLE_RE = /Annotation E2E Course/;
const TEST_TITLE = "Annotation E2E Test";
const TEST_TITLE_RE = /Annotation E2E Test/;

const authDir = path.join(__dirname, "../playwright/.auth");
const photoPath = path.join(__dirname, "fixtures", "test-answer.png");

/** Routes every S3 presigned PUT to a 200 so uploads succeed without a bucket. */
async function mockS3Put(page: import("@playwright/test").Page) {
  await page.route(
    (url) => url.href.includes("s3") || url.href.includes("amazonaws"),
    (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({ status: 200, body: "" })
        : route.continue(),
  );
}

test.describe("Image-answer + annotation flow", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    // A tiny 1x1 PNG so setInputFiles has a real image file to send.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    fs.mkdirSync(path.dirname(photoPath), { recursive: true });
    fs.writeFileSync(photoPath, png);
  });

  test("setup: admin creates student, course, enrollment, and an image-answer test", async ({
    page,
  }) => {
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For annotation e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("button", { name: "Manage Enrollments" }).click();
    await page.getByText(`@${STUDENT_USERNAME}`).click();
    await page.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(page.getByText("updated")).toBeVisible({ timeout: 10000 });

    // Create the test
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_TITLE);
    await page.getByLabel("Description").fill("For annotation e2e");
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // Add an image-answer question
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();
    await page.getByRole("button", { name: "Image Answer" }).click();
    await page.getByLabel("Question Title").fill("Solve the integral");
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("added successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("student uploads a photo answer", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockS3Put(page);

    await page.goto("http://localhost:3001/student/login");
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/student/dashboard", { timeout: 10000 });
    fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({
      path: path.join(authDir, "annotation-student.json"),
    });

    await page.getByRole("link", { name: COURSE_TITLE_RE }).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();

    // Upload a photo and submit
    await page.getByLabel("Your photos").setInputFiles(photoPath);
    await page.getByRole("button", { name: "Submit Answer" }).click();
    await expect(page.getByText("submitted successfully")).toBeVisible({
      timeout: 10000,
    });

    await context.close();
  });

  test("grader annotates the photo and releases the grade", async ({
    page,
  }) => {
    await mockS3Put(page);
    await page.goto("/admin/grading");
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();

    // The student's submitted photo is shown in the grading pane
    await expect(page.getByLabel("Drawing surface").first()).toBeVisible({
      timeout: 10000,
    });

    // Draw a freehand stroke over the photo
    const surface = page.getByLabel("Drawing surface").first();
    const box = await surface.boundingBox();
    if (!box) throw new Error("drawing surface has no bounding box");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await page.mouse.up();

    await page.getByRole("button", { name: "Save annotations" }).click();
    await expect(page.getByText("Annotations saved")).toBeVisible({
      timeout: 10000,
    });

    // Grade + release so the student can see it (release control on the page)
    await page.getByLabel("Score").first().fill("80");
    await page.getByRole("button", { name: /Save/ }).first().click();
  });

  test("student sees the grader's annotation once revealed", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: path.join(authDir, "annotation-student.json"),
    });
    const page = await context.newPage();
    await mockS3Put(page);

    await page.goto("http://localhost:3001/student/dashboard");
    await page.getByRole("link", { name: COURSE_TITLE_RE }).click();
    await page.getByRole("link", { name: TEST_TITLE_RE }).click();

    // The graded view shows the student's photo with the grader's stroke over it
    await expect(page.locator("svg polyline").first()).toBeVisible({
      timeout: 10000,
    });

    await context.close();
  });
});
