/**
 * Feature: Student sign-in with Google on /student/login
 *
 * Google is faked at both ends: the sign-in POST returns a Google-looking
 * address, and that address is fulfilled with a redirect back to the app.
 */
import { expect, type Locator, test } from "@playwright/test";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;
const GOOGLE_ORIGIN = "https://accounts.google.com";

/** Waits for React to hydrate the element; an earlier click would submit a form natively and drop what was typed. */
async function hydrated(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((node) =>
        Object.keys(node).some((key) => key.startsWith("__reactFiber$")),
      ),
    )
    .toBe(true);
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
});
