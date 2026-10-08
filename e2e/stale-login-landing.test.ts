import { expect, test } from "@playwright/test";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const SESSION_COOKIE = "better-auth.session_token";

test.describe("Landing from the home page", () => {
  test("a signed-in admin opening the home page reaches the admin dashboard", async ({
    page,
  }) => {
    // When the admin (stored session) opens the home page
    await page.goto("/");

    // Then they land on the admin dashboard
    await page.waitForURL("**/admin/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("a signed-in student opening the home page reaches the student dashboard", async ({
    page,
    browser,
  }) => {
    // Given a student created by the admin (own username, not lms-flow's)
    const username = `e2e-landing-${Date.now()}`;
    const password = "e2e-landing-password";
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "Add Student" }).first().click();
    await page.getByLabel("Full Name").fill("Landing Student");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create Student" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });

    // And the student is signed in, in a fresh context
    const context = await browser.newContext({ storageState: undefined });
    const studentPage = await context.newPage();
    await studentPage.goto("/student/login");
    await studentPage.getByLabel("Username").fill(username);
    await studentPage.getByLabel("Password").fill(password);
    await studentPage.getByRole("button", { name: "Sign In" }).click();
    await studentPage.waitForURL("**/student/dashboard", { timeout: 10000 });

    // When they open the home page again
    await studentPage.goto("/");

    // Then they land on the student dashboard
    await studentPage.waitForURL("**/student/dashboard");
    await expect(
      studentPage.getByRole("heading", { name: `Welcome, ${username}!` }),
    ).toBeVisible();

    await context.close();
  });
});

test.describe("Landing with a stale login", () => {
  test("a visitor whose saved login has gone stale lands on the home page signed out", async ({
    browser,
  }) => {
    // Given an anonymous context holding a dead session cookie
    // (storageState: undefined, or the project's admin session leaks in)
    const context = await browser.newContext({ storageState: undefined });
    await context.addCookies([
      { name: SESSION_COOKIE, value: "dead-login", url: BASE_URL },
    ]);
    const page = await context.newPage();

    // When opening the home page
    await page.goto("/");

    // Then the home page shows, signed out, with no leftover login cookie
    await expect(
      page.getByRole("heading", { name: "Learning Management System" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();

    await context.close();
  });

  test("a dead login under another accepted cookie name does not loop", async ({
    browser,
  }) => {
    // Given a dead login under a name better-auth's sign-out doesn't expire here
    const context = await browser.newContext({ storageState: undefined });
    await context.addCookies([
      { name: "better-auth-session_token", value: "dead-login", url: BASE_URL },
    ]);
    const page = await context.newPage();

    // When opening the home page
    await page.goto("/");

    // Then the home page shows (no ERR_TOO_MANY_REDIRECTS) and the cookie is gone
    await expect(
      page.getByRole("heading", { name: "Learning Management System" }),
    ).toBeVisible();
    const cookies = await context.cookies();
    expect(
      cookies.find((c) => c.name === "better-auth-session_token"),
    ).toBeUndefined();

    await context.close();
  });
});
