/**
 * Feature: Student sign-in with Google on /student/login
 *
 * Google is faked at both ends: the sign-in POST returns a Google-looking
 * address, and that address is fulfilled with a redirect back to the app.
 */
import fs from "node:fs";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { hydrated } from "./hydrated";
import { insertStudent, withDb } from "./seed";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const GOOGLE_ORIGIN = "https://accounts.google.com";

/** Fake Google round trip: the sign-in POST yields a Google address that bounces back, carrying `cookies`. */
async function fakeGoogleRoundTrip(
  page: Page,
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
) {
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        url: `${GOOGLE_ORIGIN}/o/oauth2/v2/auth?client_id=e2e`,
        redirect: false,
      }),
    }),
  );
  await page.route(`${GOOGLE_ORIGIN}/**`, async (route) => {
    await page.context().addCookies(cookies);
    await route.fulfill({
      status: 302,
      headers: { location: `${BASE_URL}/student/login` },
    });
  });
}

/** A fresh email sign-up stands in for the Google-created account; returns its session cookies and user id. */
async function signUpAccount(browser: Browser, email: string) {
  const context = await browser.newContext({ storageState: undefined });
  const response = await context.request.post(
    `${BASE_URL}/api/auth/sign-up/email`,
    {
      data: { email, password: "e2e-google-password-123", name: "Google Kid" },
    },
  );
  expect(response.ok()).toBeTruthy();
  const { user } = await response.json();
  const cookies = await context.cookies();
  await context.close();
  return { userId: user.id as string, cookies };
}

test.describe("Student sign-in card", () => {
  test("a signed-out student sees one card with Google and username + password, and Google returns them to the student login", async ({
    browser,
  }) => {
    // Given a signed-out visitor (the project default is the admin session)
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // And Google is faked: capture the callback URLs, hand back a Google address
    let postedBody: Record<string, unknown> = {};
    await page.route("**/api/auth/sign-in/social", async (route) => {
      postedBody = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          url: `${GOOGLE_ORIGIN}/o/oauth2/v2/auth?client_id=e2e`,
          redirect: false,
        }),
      });
    });
    const googleHop = new Promise<URL>((resolve) => {
      void page.route(`${GOOGLE_ORIGIN}/**`, async (route) => {
        resolve(new URL(route.request().url()));
        await route.fulfill({
          status: 302,
          headers: { location: `${BASE_URL}/student/login` },
        });
      });
    });

    // When they open the student login page
    await page.goto(`${BASE_URL}/student/login`);

    // Then one card offers both ways in, plus the two help lines
    await expect(
      page.getByRole("heading", { name: "Student sign in" }),
    ).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("or", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Joined with Google? Use Continue with Google."),
    ).toBeVisible();
    await expect(
      page.getByText("No account yet? Open your teacher's invite link."),
    ).toBeVisible();

    // When they continue with Google
    const google = page.getByRole("button", { name: "Continue with Google" });
    await hydrated(google);
    await google.click();
    const googleUrl = await googleHop;

    // Then every callback returns to the student login, via the account picker
    expect(postedBody).toMatchObject({
      callbackURL: "/student/login",
      newUserCallbackURL: "/student/login",
      errorCallbackURL: "/student/login",
    });
    expect(googleUrl.searchParams.get("prompt")).toBe("select_account");

    await context.close();
  });

  test("a student sent back by Google with an error is told sign-in didn't finish", async ({
    browser,
  }) => {
    // Given a signed-out visitor
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const googleFailed = page.getByText(
      "Google sign-in didn't finish. Please try again.",
    );

    // A plain visit shows no failure message
    await page.goto(`${BASE_URL}/student/login`);
    await expect(
      page.getByRole("heading", { name: "Student sign in" }),
    ).toBeVisible();
    await expect(googleFailed).toHaveCount(0);

    // When Google sends them back with an error (e.g. they cancelled)
    await page.goto(`${BASE_URL}/student/login?error=access_denied`);

    // Then the card says so and still offers both ways in
    await expect(googleFailed).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();

    // When they then try a wrong password instead
    const signIn = page.getByRole("button", { name: "Sign in", exact: true });
    await hydrated(signIn);
    await page.getByLabel("Username").fill("no-such-student");
    await page.getByLabel("Password").fill("wrong-password-123");
    await signIn.click();

    // Then only the password error shows, never two errors at once
    await expect(page.getByText("Invalid username or password")).toBeVisible();
    await expect(googleFailed).toHaveCount(0);

    await context.close();
  });

  test("a student who joined with Google signs in with Continue with Google and lands on their home", async ({
    browser,
  }) => {
    // Given a Google-joined student: an account plus a student profile linked to it
    const username = `google-kid-${Date.now()}`;
    const { userId, cookies } = await signUpAccount(
      browser,
      `${username}@example.com`,
    );
    await withDb((db) =>
      insertStudent(db, { authUserId: userId, username, name: username }),
    );

    // And a signed-out visitor on the student login card
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await fakeGoogleRoundTrip(page, cookies);
    await page.goto(`${BASE_URL}/student/login`);
    await expect(
      page.getByRole("heading", { name: "Student sign in" }),
    ).toBeVisible();

    // When they continue with Google
    const google = page.getByRole("button", { name: "Continue with Google" });
    await hydrated(google);
    await google.click();

    // Then they land on their student home
    await page.waitForURL("**/student/dashboard");
    await expect(
      page.getByRole("heading", { name: `Welcome, ${username}!` }),
    ).toBeVisible();

    await context.close();
  });

  test("a Google account with no student profile sees Account not set up and can sign out", async ({
    browser,
  }) => {
    // Given a Google account that never joined a course (no student profile)
    const { cookies } = await signUpAccount(
      browser,
      `never-joined-${Date.now()}@example.com`,
    );

    // And a signed-out visitor on the student login card
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await fakeGoogleRoundTrip(page, cookies);
    await page.goto(`${BASE_URL}/student/login`);
    await expect(
      page.getByRole("heading", { name: "Student sign in" }),
    ).toBeVisible();

    // When they continue with Google
    const google = page.getByRole("button", { name: "Continue with Google" });
    await hydrated(google);
    await google.click();

    // Then they are told the account isn't set up, with a way out
    await expect(
      page.getByRole("heading", { name: "Account not set up" }),
    ).toBeVisible();
    await expect(
      page.getByText("This account isn't set up for this school yet."),
    ).toBeVisible();

    // When they sign out
    const signOut = page.getByRole("button", { name: "Sign out" });
    // the redirect back is not awaited like goto, so a click can land before React hydrates and be dropped
    await hydrated(signOut);
    await signOut.click();
    // client-side navigation: no load event, so assert the URL instead of waiting for one
    await expect(page).toHaveURL(`${BASE_URL}/`);

    // Then the student login shows the sign-in card again
    await page.goto(`${BASE_URL}/student/login`);
    await expect(
      page.getByRole("heading", { name: "Student sign in" }),
    ).toBeVisible();
    await expect(page.getByText("Account not set up")).toHaveCount(0);

    await context.close();
  });

  test("a teacher who uses Continue with Google on the student login lands on the teacher side", async ({
    browser,
  }) => {
    // Given the teacher's session, handed over when Google bounces back
    const { cookies } = JSON.parse(
      fs.readFileSync("playwright/.auth/admin.json", "utf8"),
    );

    // And a signed-out visitor on the student login card
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await fakeGoogleRoundTrip(page, cookies);
    await page.goto(`${BASE_URL}/student/login`);
    await expect(
      page.getByRole("heading", { name: "Student sign in" }),
    ).toBeVisible();

    // When they continue with Google
    const google = page.getByRole("button", { name: "Continue with Google" });
    await hydrated(google);
    await google.click();

    // Then they land on To grade, not the student home
    await page.waitForURL("**/admin/grading");
    await expect(page.getByRole("heading", { name: "To grade" })).toBeVisible();

    await context.close();
  });
});
