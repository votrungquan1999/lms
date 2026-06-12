import { expect, test } from "@playwright/test";

const COURSE_NAME = "Pool Compose Course";
const TEST_NAME = "Pool Compose Test";
const POOL_NAME = "E2E Pool";
const POOL_QUESTION_TITLE = "E2E Pool Question";

/**
 * End-to-end: an admin builds a question pool, authors a question in it, then
 * composes that question into a test via the "Add from Pools" panel — the full
 * Feature B flow through the UI. Runs serially; relies on the pre-authenticated
 * admin storage state (see auth.setup.ts), like the other admin e2e flows.
 */
test.describe("Question pool → compose test flow", () => {
  test.describe.configure({ mode: "serial" });

  test("admin creates a course and a test to compose into", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_NAME);
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.keyboard.press("Escape");
    await page.goto("/admin/courses");
    await page.getByText(COURSE_NAME).click();
    await page.getByRole("button", { name: "Add Test" }).click();
    await page.getByLabel("Test Title").fill(TEST_NAME);
    await page.getByRole("button", { name: "Create Test" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
  });

  test("admin creates a pool from the Question Bank", async ({ page }) => {
    await page.goto("/admin/pools");
    await expect(
      page.getByRole("heading", { name: "Question Bank" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add Pool" }).click();
    await expect(
      page.getByRole("heading", { name: "Create Pool" }),
    ).toBeVisible();
    await page.getByLabel("Pool Name").fill(POOL_NAME);
    await page.getByRole("button", { name: "Create Pool" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    await page.keyboard.press("Escape");
    await page.goto("/admin/pools");
    await expect(page.getByText(POOL_NAME)).toBeVisible();
  });

  test("admin authors a question inside the pool", async ({ page }) => {
    await page.goto("/admin/pools");
    await page.getByText(POOL_NAME).click();
    await expect(page.getByRole("heading", { name: POOL_NAME })).toBeVisible();

    await page.getByLabel("Question Title").fill(POOL_QUESTION_TITLE);
    await page.getByLabel("Content (Markdown)").fill("Explain Big-O notation.");
    await page.getByRole("button", { name: "Add Question" }).click();
    await expect(page.getByText("Question added to pool")).toBeVisible({
      timeout: 10000,
    });

    await page.reload();
    await expect(page.getByText(POOL_QUESTION_TITLE)).toBeVisible();
  });

  test("admin composes the pool question into the test", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_NAME).click();
    await page.getByText(TEST_NAME).click();
    await expect(page.getByRole("heading", { name: TEST_NAME })).toBeVisible();

    // Select the pool in the "Add from Pools" panel and compose 1 question.
    await page.getByLabel(`Select pool ${POOL_NAME}`).check();
    await page.getByRole("button", { name: "Add from Pools" }).click();
    await expect(page.getByText(/Added 1 question from pools/)).toBeVisible({
      timeout: 10000,
    });

    // The composed question now appears in the test's question list.
    await page.reload();
    await expect(page.getByText(POOL_QUESTION_TITLE)).toBeVisible();
  });
});
