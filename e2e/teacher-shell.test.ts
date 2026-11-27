/**
 * Feature: the teacher's sidebar shell
 *
 * The school name and switcher sit at the top of the sidebar; the email and
 * Sign out sit at the bottom. The sidebar marks the current page, and nested
 * pages show their breadcrumb inside the page.
 */
import { expect, type Page, test } from "@playwright/test";
import { ADMIN_EMAIL } from "./admin-account";
import { hydrated } from "./hydrated";
import { createOwnSchool, type OwnSchool } from "./own-school";
import {
  clearSchoolData,
  enroll,
  expectNoPageOverflow,
  insertAnswer,
  insertCourse,
  insertJoinRequest,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "./seed";

const SIDEBAR = '[data-sidebar="sidebar"]';

/** Hides the dev server's corner indicator, which sits over the rail's bottom buttons in dev only. */
async function hideDevIndicator(page: Page) {
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
}

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

test.describe("Teacher shell: where a teacher lands", () => {
  test("an old Dashboard link opens To grade", async ({ page }) => {
    // When a teacher opens the old Dashboard address
    await page.goto("/admin/dashboard");

    // Then they are on To grade
    await expect(page).toHaveURL(/\/admin\/grading$/);
    await expect(page.getByRole("heading", { name: "To grade" })).toBeVisible();
  });

  test("the teacher login's Google button asks to return to To grade", async ({
    browser,
  }) => {
    // Given a signed-out visitor on the teacher login, with the sign-in POST captured
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    let postedBody: Record<string, unknown> = {};
    await page.route("**/api/auth/sign-in/social", async (route) => {
      postedBody = route.request().postDataJSON();
      await route.abort();
    });
    await page.goto("/admin/login");

    // When they continue with Google
    const google = page.getByRole("button", { name: "Sign in with Google" });
    await hydrated(google);
    await google.click();

    // Then the sign-in asks to come back to To grade
    await expect.poll(() => postedBody.callbackURL).toBe("/admin/grading");
    await context.close();
  });

  test("after switching school a teacher lands on To grade", async ({
    browser,
  }) => {
    // Given a teacher in two schools, on Courses in their own school
    const own = await createOwnSchool(browser, "teacher-landing");
    try {
      const page = await own.context.newPage();
      await page.goto("/admin/courses");
      const trigger = page
        .locator(SIDEBAR)
        .getByRole("button", { name: new RegExp(own.name) });
      await hydrated(trigger);
      await trigger.click();

      // When they pick the other school
      await page.getByRole("menuitemradio", { name: "E2E School" }).click();

      // Then they land on To grade
      await expect(page).toHaveURL(/\/admin\/grading$/);
      await page.close();
    } finally {
      await own.remove();
    }
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

    // When they open grading from the course's Tests tab
    await page.goto(`/admin/courses/${courseId}/tests/${testId}/grading`);

    // Then To grade is the only current entry there too
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("To grade");

    // When they go back to the test page
    await page.goto(`/admin/courses/${courseId}/tests/${testId}`);

    // Then Courses is the current entry again
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText("Courses");
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

test.describe("Teacher shell: the sidebar by screen size", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let own: OwnSchool;
  test.beforeAll(async ({ browser }) => {
    // Given a school with one submission waiting and one join request waiting
    own = await createOwnSchool(browser, "sidebar-sizes");
    const schoolId = own.schoolId;
    await withDb(async (db) => {
      await clearSchoolData(db, schoolId);
      const courseId = await insertCourse(db, {
        title: "Size Course",
        schoolId,
      });
      const testId = await insertTest(db, courseId, {
        title: "Size Test",
        schoolId,
      });
      const questionId = await insertQuestion(db, testId, {
        type: "free_text",
      });
      const studentId = await insertStudent(db, {
        name: "Sia",
        schoolIds: [schoolId],
      });
      await enroll(db, { courseId, studentId });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: "x" },
      });
      await insertSubmission(db, { testId, studentId });
      const requester = await insertStudent(db, {
        name: "Rey",
        schoolIds: [],
      });
      await insertJoinRequest(db, { courseId, studentId: requester, schoolId });
    });
  });
  test.afterAll(async () => {
    await own?.remove();
  });

  test("on a tablet the sidebar is an icon rail with tooltips, badges and an account menu", async () => {
    // Given a teacher on a tablet-sized screen
    const page = await own.context.newPage();
    await page.setViewportSize({ width: 834, height: 1194 });

    // When they open To grade
    await page.goto("/admin/grading");

    // Then the sidebar is folded to a rail about 56 px wide
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(sidebar).toHaveAttribute("data-collapsible", "icon");
    const container = page.locator('[data-slot="sidebar-container"]');
    await expect
      .poll(async () => Math.round((await container.boundingBox())?.width ?? 0))
      .toBe(56);

    // And no link is wider than the rail
    for (const link of await sidebar.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(56);
    }

    // And the counts show on the icons, with the link named by its count
    const toGrade = sidebar.getByRole("link", { name: "To grade, 1 waiting" });
    await expect(toGrade).toBeVisible();
    await expect(sidebar.getByTestId("rail-badge")).toHaveText(["1", "1"]);

    // When they hover the To grade icon
    await toGrade.hover();

    // Then its tooltip names the entry and the count
    await expect(page.getByRole("tooltip")).toContainText(
      "To grade · 1 waiting",
    );

    // When they open the school tile at the top of the rail
    const tile = sidebar.getByTestId("school-switcher-trigger");
    await hydrated(tile);
    await tile.click();

    // Then the school list opens
    await expect(page.getByText("Your schools")).toBeVisible();
    await page.keyboard.press("Escape");

    // When they open the account button
    await hideDevIndicator(page);
    await sidebar.getByRole("button", { name: /^Account/ }).click();

    // Then the menu holds the email and Sign out only
    const menu = page.getByRole("menu");
    await expect(menu).toContainText(ADMIN_EMAIL);
    await expect(menu.getByRole("menuitem")).toHaveText(["Sign out"]);
    await page.keyboard.press("Escape");

    // And the page does not scroll sideways
    await expectNoPageOverflow(page);
    await page.close();
  });
  test("on a tablet a page load shows the rail at once, and only the teacher's own expand slides", async () => {
    // Given a teacher on a tablet-sized screen, with the sidebar's slides recorded
    const page = await own.context.newPage();
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.addInitScript(() => {
      const slides: string[] = [];
      Object.assign(window, { sidebarSlides: slides });
      document.addEventListener(
        "transitionrun",
        (event) => {
          const slot = (event.target as HTMLElement).dataset?.slot;
          if (slot === "sidebar-gap" || slot === "sidebar-container") {
            slides.push(`${slot} ${event.propertyName}`);
          }
        },
        true,
      );
    });
    const slides = () =>
      page.evaluate(
        () => (window as unknown as { sidebarSlides: string[] }).sidebarSlides,
      );

    // When they open To grade
    await page.goto("/admin/grading");
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    // Two frames give a slide time to start and report itself
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );

    // Then the sidebar is already at rail width, with no slide from full width
    const container = page.locator('[data-slot="sidebar-container"]');
    expect(Math.round((await container.boundingBox())?.width ?? 0)).toBe(56);
    expect(await slides()).toEqual([]);

    // When they press the expand button
    const expand = sidebar.getByRole("button", { name: "Expand sidebar" });
    await hydrated(expand);
    await hideDevIndicator(page);
    await expand.click();

    // Then the sidebar slides open
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect.poll(slides).toContain("sidebar-container width");
    await page.close();
  });
  test("on a desktop the sidebar is open with labels, and its fold button folds it to the rail and back", async () => {
    // Given a teacher on a desktop-sized screen
    const page = await own.context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // When they open To grade
    await page.goto("/admin/grading");

    // Then the sidebar is open with its labels, and there is no top bar
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect(
      sidebar.getByRole("link", { name: "Courses", exact: true }),
    ).toContainText("Courses");
    await expect(
      page.locator('[data-slot="sidebar-inset"] > header'),
    ).toBeHidden();

    // When they press the fold button
    const fold = sidebar.getByRole("button", { name: "Collapse sidebar" });
    await hydrated(fold);
    await fold.click();

    // Then the sidebar is a rail, with an expand button
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    const expand = sidebar.getByRole("button", { name: "Expand sidebar" });

    // When they press the expand button
    await hideDevIndicator(page);
    await expand.click();

    // Then the sidebar is open again
    await expect(sidebar).toHaveAttribute("data-state", "expanded");

    // When they press the keyboard shortcut
    await page.keyboard.press("Control+b");

    // Then it folds again
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await page.close();
  });
  test("on a phone a 56 px top bar opens the sidebar as a sheet with every entry, and Close menu shuts it", async () => {
    // Given a teacher on a phone-sized screen
    const page = await own.context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });

    // When they open To grade
    await page.goto("/admin/grading");

    // Then a 56 px top bar holds the menu button, and no sidebar shows
    const bar = page.locator('[data-slot="sidebar-inset"] > header');
    const open = bar.getByRole("button", { name: "Open menu" });
    await expect(open).toBeVisible();
    expect((await bar.boundingBox())?.height).toBe(56);
    await expect(page.getByRole("link", { name: "Courses" })).toHaveCount(0);
    await expectNoPageOverflow(page);

    // When they press the menu button
    await hydrated(open);
    await open.click();

    // Then a sheet lists every entry with the counts, and Sign out
    const sheet = page.getByRole("dialog");
    for (const name of [
      "To grade, 1 waiting",
      "Courses",
      "Question bank",
      "Students",
      "Join requests, 1 waiting",
    ]) {
      await expect(sheet.getByRole("link", { name })).toBeVisible();
    }
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();

    // When they press Close menu
    await sheet.getByRole("button", { name: "Close menu" }).click();

    // Then the sheet is gone
    await expect(sheet).toHaveCount(0);

    // When they open it again and tap Courses
    await open.click();
    await sheet.getByRole("link", { name: "Courses" }).click();

    // Then the page changes and the sheet closes by itself
    await expect(page).toHaveURL(/\/admin\/courses$/);
    await expect(sheet).toHaveCount(0);
    await page.close();
  });

  test("on a phone, tapping the current page's entry closes the sheet", async () => {
    // Given a teacher on To grade on a phone with the menu open
    const page = await own.context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/grading");
    const open = page
      .locator('[data-slot="sidebar-inset"] > header')
      .getByRole("button", { name: "Open menu" });
    await hydrated(open);
    await open.click();
    const sheet = page.getByRole("dialog");

    // When they tap To grade, the page they are already on
    await sheet.getByRole("link", { name: /^To grade/ }).click();

    // Then the sheet closes
    await expect(sheet).toHaveCount(0);
    await page.close();
  });

  test("on a phone, switching school from the menu on To grade closes the sheet", async ({
    browser,
  }) => {
    // Given a teacher in two schools, on To grade on a phone with the menu open
    const school = await createOwnSchool(browser, "teacher-sheet");
    try {
      const page = await school.context.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin/grading");
      const open = page
        .locator('[data-slot="sidebar-inset"] > header')
        .getByRole("button", { name: "Open menu" });
      await hydrated(open);
      await open.click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();

      // When they switch to the other school
      await sheet
        .getByRole("button", { name: new RegExp(school.name) })
        .click();
      await page.getByRole("menuitemradio", { name: "E2E School" }).click();

      // Then they are still on To grade, now in the other school, and the sheet is gone
      await expect(
        page.locator('[data-slot="sidebar-inset"] > header'),
      ).toBeVisible();
      await expect(sheet).toHaveCount(0);
      await page.close();
    } finally {
      await school.remove();
    }
  });
});
