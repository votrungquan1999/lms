/**
 * Feature: long unbroken text in an AI document import (E2E)
 *
 * The in-process AI mock (see `src/mocks/e2e-ai-mock.ts`) answers a document
 * containing "Unbroken text case" with a question whose title, content and
 * model answer are one long run with no spaces. The review card must wrap it
 * so the page never scrolls sideways and the card's Edit and Delete stay in view.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { createElement } from "react";

const COURSE_TITLE = "Import Long Text E2E Course";
const TEST_TITLE = "Import Long Text E2E Test";

let pdfPath: string;

test.describe("AI Document Import — long unbroken text", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const buffer = await renderToBuffer(
      createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4" },
          createElement(Text, null, "1. Unbroken text case"),
        ),
      ),
    );
    pdfPath = path.join(os.tmpdir(), `import-ai-long-text-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, buffer);
  });

  test.afterAll(() => {
    if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  });

  test("setup: admin creates a course and a test", async ({ page }) => {
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page.getByLabel("Description").fill("For import-ai long text e2e");
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

  test("an unbroken title wraps in the card, the page does not scroll sideways, and Edit and Delete stay in view", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("link", { name: "Import Questions with AI" }).click();
    await page.getByLabel(/document/i).setInputFiles(pdfPath);

    const edit = page.getByRole("button", { name: "Edit", exact: true });
    await expect(edit).toBeVisible({ timeout: 20000 });

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    await expect(edit).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: /^Delete question/ }),
    ).toBeInViewport({ ratio: 1 });
  });
  test("in Student view the column is the student page's width and an unbroken word wraps inside its card", async ({
    page,
  }) => {
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await page.getByText(TEST_TITLE).click();
    await page.getByRole("link", { name: "Import Questions with AI" }).click();
    await page.getByLabel(/document/i).setInputFiles(pdfPath);
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: "Student view" }).click();
    const region = page.getByRole("region", { name: "Student view" });
    await expect(region).toBeVisible();

    const measured = await region.evaluate((el) => {
      const box = (node: Element) => node.getBoundingClientRect();
      const column = el.firstElementChild as HTMLElement;
      const card = column.firstElementChild as HTMLElement;
      const wide = Array.from(card.querySelectorAll("*")).find((node) =>
        node.textContent?.trim().startsWith("aaaaaaaa"),
      ) as HTMLElement;
      return {
        regionWidth: box(el).width,
        columnWidth: box(column).width,
        cardLeft: box(card).left,
        cardRight: box(card).right,
        wideRight: box(wide).right,
        wideScrollWidth: wide.scrollWidth,
        wideClientWidth: wide.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });

    // The student page caps its content at max-w-5xl (1024px)
    expect(measured.columnWidth).toBeCloseTo(
      Math.min(1024, measured.regionWidth),
      0,
    );
    // The word wraps in its box instead of widening the card or the page
    expect(measured.wideScrollWidth).toBeLessThanOrEqual(
      measured.wideClientWidth,
    );
    expect(measured.wideRight).toBeLessThanOrEqual(measured.cardRight);
    expect(measured.docScrollWidth).toBeLessThanOrEqual(measured.innerWidth);
  });
});
