/**
 * Feature: the teacher's sidebar shell
 *
 * The school name and switcher sit at the top of the sidebar; the email and
 * Sign out sit at the bottom. The sidebar marks the current page, and nested
 * pages show their breadcrumb inside the page.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL } from "./admin-account";
import { hydrated } from "./hydrated";
import { createOwnSchool, type OwnSchool } from "./own-school";
import { insertCourse, insertTest, withDb } from "./seed";

const SIDEBAR = '[data-sidebar="sidebar"]';

test.describe("Teacher shell: school at the top of the sidebar", () => {
  test.describe.configure({ mode: "serial" });

  let own: OwnSchool;
  test.afterAll(async () => {
    await own?.remove();
  });

  test("a teacher in one school sees its name at the top with no school list", async ({
    page,
  }) => {
    // Given a teacher who belongs to the shared e2e school only
    // When they open Courses
    await page.goto("/admin/courses");

    // Then the sidebar top shows the app name and the school, with no switcher
    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar.getByText("LMS Admin")).toBeVisible();
    await expect(sidebar.getByText("E2E School")).toHaveCount(1);
    await expect(
      sidebar.getByRole("button", { name: /E2E School/ }),
    ).toHaveCount(0);
  });

  test("a teacher in two schools switches school from the sidebar top, and the email and Sign out sit at the bottom", async ({
    browser,
  }) => {
    // Given a teacher in two schools, working in their own school
    own = await createOwnSchool(browser, "teacher-shell");
    const page = await own.context.newPage();
    await page.goto("/admin/courses");
    const sidebar = page.locator(SIDEBAR);

    // Then the school name shows once, in the sidebar and not in a top bar
    await expect(sidebar.getByText(own.name)).toHaveCount(1);
    await expect(page.locator("header").getByText(own.name)).toHaveCount(0);

    const trigger = sidebar.getByRole("button", { name: new RegExp(own.name) });

    // And the email and Sign out sit at the bottom of the sidebar
    const email = sidebar.getByText(ADMIN_EMAIL);
    const signOut = sidebar.getByRole("button", { name: "Sign out" });
    await expect(email).toBeVisible();
    await expect(signOut).toBeVisible();
    const trigBox = await trigger.boundingBox();
    const signOutBox = await signOut.boundingBox();
    expect(signOutBox?.y).toBeGreaterThan(trigBox?.y ?? Infinity);

    // When they open the school list
    await hydrated(trigger);
    await trigger.click();

    // Then both schools are listed and the current one is checked
    await expect(page.getByText("Your schools")).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: own.name }),
    ).toBeChecked();
    await expect(
      page.getByRole("menuitemradio", { name: "E2E School" }),
    ).not.toBeChecked();

    // When they pick the other school
    await page.getByRole("menuitemradio", { name: "E2E School" }).click();

    // Then the sidebar top shows the other school
    await expect(
      page.locator(SIDEBAR).getByRole("button", { name: /E2E School/ }),
    ).toBeVisible();
    await page.close();
  });
});

test.describe("Teacher shell: where the teacher is", () => {
  test("the sidebar marks the current section as the current page, also on nested pages", async ({
    page,
  }) => {
    // The dev server compiles each nested route on first visit.
    test.setTimeout(120_000);

    // Given a course with a test
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db, { title: "Shell Course" });
      const testId = await insertTest(db, courseId, { title: "Shell Test" });
      return { courseId, testId };
    });
    const current = page.locator(`${SIDEBAR} [aria-current="page"]`);

    // When they open a test inside the course
    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);

    // Then Courses is the only current entry
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText("Courses");

    // When they open grading for that test
    await page.goto(`/admin/grading/${testId}`);

    // Then To grade is the only current entry
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("To grade");
  });

  test("a nested page shows its breadcrumb inside the page above the title, and a top-level page shows none", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Given a course with a test
    const { courseId, testId } = await withDb(async (db) => {
      const courseId = await insertCourse(db, { title: "Trail Course" });
      const testId = await insertTest(db, courseId, { title: "Trail Test" });
      return { courseId, testId };
    });
    const trail = page.getByRole("navigation", { name: "breadcrumb" });

    // When they open the test page
    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);

    // Then the trail names course and test, sits inside the page content, above the title
    await expect(trail).toContainText("Courses");
    await expect(trail).toContainText("Trail Course");
    await expect(trail).toContainText("Trail Test");
    const trailBox = await trail.boundingBox();
    const titleBox = await page
      .getByRole("heading", { level: 1 })
      .boundingBox();
    expect(trailBox?.y).toBeLessThan(titleBox?.y ?? 0);
    await expect(
      page.locator("header").getByRole("navigation", { name: "breadcrumb" }),
    ).toHaveCount(0);

    // When they go to Courses from the sidebar (a client navigation)
    const courses = page
      .locator(SIDEBAR)
      .getByRole("link", { name: "Courses" });
    await hydrated(courses);
    await courses.click();
    await expect(page).toHaveURL(/\/admin\/courses$/);

    // Then no trail remains on the top-level page
    await expect(trail).toHaveCount(0);
  });
});
