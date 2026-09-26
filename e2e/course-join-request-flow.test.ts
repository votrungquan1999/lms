/**
 * Feature: Course Join Request Flow (Step 35)
 *
 * As a prospective student
 * I want to register from an invite link and be enrolled once an admin approves
 * So that I never need a pre-existing account to join a course
 *
 * Self-contained — creates its own course. The invite/registration half of the
 * journey runs in a browser context that starts with NO session at all (not
 * the admin storageState the "e2e-flow" project injects by default), same
 * pattern lms-flow.test.ts uses for its student-side steps.
 */
import { expect, test } from "@playwright/test";

// Must follow playwright.config.ts's E2E_PORT, or this spec would drive a
// different server than the one the suite started (see mc-edge-cases.test.ts).
const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const COURSE_TITLE = "Join Request E2E Course";
const STUDENT_NAME = "Join Request Student";
const STUDENT_USERNAME = "join-request-e2e-student";
const STUDENT_PASSWORD = "join-request-e2e-password";

let inviteJoinPath: string;

test.describe("Course Join Request Flow", () => {
  test.describe.configure({ mode: "serial" });

  // ─── Admin creates a course and mints an invite link ──────────────────────

  test("admin creates a course and mints an invite link", async ({ page }) => {
    // Given the admin creates a course
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(COURSE_TITLE);
    await page
      .getByLabel("Description")
      .fill("Course used by the join-request e2e journey");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // When navigating into the course and minting a join link
    await page.goto("/admin/courses");
    await page.getByText(COURSE_TITLE).click();
    await expect(
      page.getByRole("heading", { name: COURSE_TITLE }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Get Join Link" }).click();

    // Then the invite path is shown
    const codeLocator = page.locator("code");
    await expect(codeLocator).toBeVisible({ timeout: 10000 });
    inviteJoinPath = (await codeLocator.innerText()).trim();
    expect(inviteJoinPath).toMatch(/^\/join\//);
  });

  // ─── A never-logged-in browser sees registration, not a login wall ────────

  test("a browser that was never logged in sees registration on the invite link, not a login wall", async ({
    browser,
  }) => {
    // Given a fresh browser context — no cookies, no prior session.
    // storageState: undefined is required, not just the default: browser
    // fixtures created inside a test otherwise inherit the "e2e-flow"
    // project's own storageState (playwright/.auth/admin.json), silently
    // handing this "anonymous" context an admin session.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // When opening the invite link directly
    await page.goto(`${BASE_URL}${inviteJoinPath}`);

    // Then the course invite is shown with a registration form, not a login screen
    // (ValidInviteCard's title is shadcn's CardTitle — a styled div, not a
    // semantic heading — so this asserts by text, not role)
    await expect(page.getByText("You're invited to join")).toBeVisible();
    await expect(page.getByText(COURSE_TITLE)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Account" }),
    ).toBeVisible();
    expect(page.url()).toContain(inviteJoinPath);

    await context.close();
  });

  // ─── Registering creates the account and files a pending join request ────

  test("registering from the invite link creates the account and files a pending join request", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}${inviteJoinPath}`);

    // When filling out the registration form
    await page.getByLabel("Full Name").fill(STUDENT_NAME);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();

    // Then the account is created and a pending request is filed for this course
    await expect(
      page.getByText(
        `Your request to join "${COURSE_TITLE}" is now waiting for admin approval.`,
      ),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await context.close();
  });

  // ─── The admin queue shows the pending request ────────────────────────────

  test("the admin queue shows the pending request", async ({ page }) => {
    await page.goto("/admin/join-requests");
    await expect(
      page.getByRole("heading", { name: "Join Requests" }),
    ).toBeVisible();
    await expect(page.getByText(STUDENT_NAME)).toBeVisible();
    await expect(
      page.getByText(`@${STUDENT_USERNAME} wants to join ${COURSE_TITLE}`),
    ).toBeVisible();
  });

  // ─── Approving the request enrolls the student ────────────────────────────

  test("approving the request enrolls the student", async ({ page }) => {
    await page.goto("/admin/join-requests");
    const row = page
      .locator('[data-testid^="join-request-row-"]')
      .filter({ hasText: STUDENT_NAME });
    await expect(row).toBeVisible();

    // When the admin approves it
    await row.getByRole("button", { name: "Approve" }).click();

    // Then the request leaves the Waiting queue (approve has no inline success
    // message — only failures render one, per approve-reject-buttons.tsx)
    await expect(page.getByText(STUDENT_NAME)).not.toBeVisible({
      timeout: 10000,
    });
  });

  // ─── The student, signed in, sees the course ──────────────────────────────

  test("the student, signed in, sees the course they were approved into", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // When the student signs in with the account they registered
    await page.goto(`${BASE_URL}/student/login`);
    await page.getByLabel("Username").fill(STUDENT_USERNAME);
    await page.getByLabel("Password").fill(STUDENT_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();

    // Then they land on their dashboard and see the course they were approved into
    await page.waitForURL("**/student/dashboard", { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: `Welcome, ${STUDENT_USERNAME}!` }),
    ).toBeVisible();
    // Scoped to the "Your courses" section — the sidebar's own course-nav
    // list repeats the same title, which would otherwise be a strict-mode
    // (ambiguous match) violation.
    const yourCourses = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Your courses" }) });
    await expect(yourCourses.getByText(COURSE_TITLE)).toBeVisible();

    await context.close();
  });
});
