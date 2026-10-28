/**
 * Feature: pictures in an AI document import (E2E)
 *
 * An admin uploads a .docx with two pictures. The AI reply (answered by the
 * in-process mock, see `src/mocks/e2e-ai-mock.ts`) keeps the `[image 1]`
 * marker in the first question's text and leaves picture 2 unmarked. The
 * marked picture must land on that question, the unmarked one must wait in
 * "Unused pictures" until the admin adds it, and Import must save both with
 * the question.
 */
import path from "node:path";
import { expect, test } from "@playwright/test";
import { MongoClient } from "mongodb";
import { E2E_MONGODB_URI } from "./mongodb-uri";

const COURSE_TITLE = "Import Pictures E2E Course";
const TEST_TITLE = "Import Pictures E2E Test";
const QUESTION_TITLE = "Câu 1";
const PICTURES_DOCX = path.join(__dirname, "fixtures", "pictures.docx");

test.describe("AI Document Import — pictures", () => {
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

  test("setup: admin creates a course and a test", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For import-ai pictures e2e");
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

  test("the marked picture lands on its question, the unmarked one is added by hand, and Import saves both", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("link", { name: "Import Questions with AI" }).click();
    await page.getByLabel(/document/i).setInputFiles(PICTURES_DOCX);

    // The marker the mock left in the question text attached picture 1.
    await expect(page.getByAltText("Figure 1")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByAltText("Figure 2")).toHaveCount(0);
    await expect(page.getByAltText("Unused picture 1")).toHaveCount(0);

    // Picture 2 was left unmarked, so it waits in Unused pictures.
    await expect(
      page.getByRole("heading", { name: "Unused pictures" }),
    ).toBeVisible();
    await expect(page.getByAltText("Unused picture 2")).toBeVisible();

    // Adding it moves it onto the chosen question.
    await page
      .getByLabel("Question for picture 2")
      .selectOption({ label: `#1 ${QUESTION_TITLE}` });
    await page.getByRole("button", { name: "Add picture 2" }).click();
    await expect(page.getByAltText("Figure 2")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Unused pictures" }),
    ).toHaveCount(0);

    // The tag itself never shows in the question text.
    await expect(page.getByText("[image 1]")).toHaveCount(0);

    await page.getByRole("button", { name: "Import questions" }).click();
    await expect(
      page.getByRole("heading", { name: TEST_TITLE, level: 1 }),
    ).toBeVisible({ timeout: 30000 });
    // The test page names each picture as students see it.
    await expect(page.getByText("Picture 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Picture 2", { exact: true })).toBeVisible();

    // Both pictures are saved on the question.
    const testId = new URL(page.url()).pathname.match(/tests\/([^/]+)/)?.[1];
    const client = new MongoClient(E2E_MONGODB_URI);
    try {
      await client.connect();
      const saved = await client
        .db()
        .collection<{ media?: { fileName: string }[] }>("question")
        .findOne({ testId, deletedAt: null });
      expect(saved?.media?.map((media) => media.fileName)).toEqual([
        expect.stringMatching(/^picture-1\./),
        expect.stringMatching(/^picture-2\./),
      ]);
    } finally {
      await client.close();
    }
  });
});
