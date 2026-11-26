/**
 * Feature: the teacher's sidebar shell
 *
 * The school name and switcher sit at the top of the sidebar; the email and
 * Sign out sit at the bottom.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL } from "./admin-account";
import { hydrated } from "./hydrated";
import { createOwnSchool, type OwnSchool } from "./own-school";

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
    await expect(page.getByRole("banner").getByText(own.name)).toHaveCount(0);

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
