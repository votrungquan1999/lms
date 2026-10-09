/**
 * Feature: A new student continuing with Google on a course invite link
 *
 * A fresh email sign-up stands in for the Google-created account: same shape
 * (validly signed session, no student record), without the OAuth round trip.
 */
import {
  type Browser,
  type BrowserContext,
  expect,
  test,
} from "@playwright/test";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;

test.describe("Google sign-in on a course invite link", () => {
  let courseTitle: string;
  let invitePath: string;

  // Given a course with an invite link
  test.beforeAll(async ({ browser }) => {
    courseTitle = `Google Join E2E ${Date.now()}`;
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/admin/courses`);
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(courseTitle);
    await page.getByLabel("Description").fill("Course for the Google join e2e");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 10000,
    });
    await page.goto(`${BASE_URL}/admin/courses`);
    await page.getByText(courseTitle).click();
    await page.getByRole("button", { name: "Get Join Link" }).click();
    const codeLocator = page.locator("code");
    await expect(codeLocator).toBeVisible({ timeout: 10000 });
    invitePath = (await codeLocator.innerText()).trim();
    expect(invitePath).toMatch(/^\/join\//);
    await page.close();
  });

  // A fresh email sign-up stands in for the Google-created account
  async function signedInNewUser(
    browser: Browser,
    email: string,
  ): Promise<BrowserContext> {
    const context = await browser.newContext({ storageState: undefined });
    const signUp = await context.request.post(
      `${BASE_URL}/api/auth/sign-up/email`,
      {
        data: {
          email,
          password: "e2e-google-join-password",
          name: "Google Joiner",
        },
      },
    );
    expect(signUp.ok()).toBeTruthy();
    return context;
  }

  test("a new student returning from Google gets their join request, not the join card again", async ({
    browser,
  }) => {
    // Given a brand-new signed-in user with no student record
    const context = await signedInNewUser(
      browser,
      `e2e-google-join-${Date.now()}@example.com`,
    );
    const studentPage = await context.newPage();

    // When they land on the invite link the way Google sends them back
    await studentPage.goto(`${BASE_URL}${invitePath}?google=1`);

    // Then their join request is waiting for approval, not the sign-up form
    await expect(
      studentPage.getByText(
        `Your request to join "${courseTitle}" is now waiting for admin approval.`,
      ),
    ).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  test("a new student whose Google email gives no usable username picks one and gets their join request", async ({
    browser,
  }) => {
    // Given a signed-in user whose email's local part fails the username
    // pattern (leading underscore), so no username can be derived
    const context = await signedInNewUser(
      browser,
      `_gj-${Date.now()}@example.com`,
    );
    const studentPage = await context.newPage();

    // When they land on the invite link the way Google sends them back
    await studentPage.goto(`${BASE_URL}${invitePath}?google=1`);

    // Then they are asked to choose a username
    await expect(
      studentPage.getByText("Choose a username to finish joining with Google."),
    ).toBeVisible({ timeout: 10000 });

    // When they pick one and finish
    await studentPage.getByLabel("Username").fill(`gj-${Date.now()}`);
    await studentPage.getByRole("button", { name: "Finish joining" }).click();

    // Then the account exists and the join request awaits approval
    await expect(
      studentPage.getByText(
        `Account created. Your request to join "${courseTitle}" is now waiting for admin approval.`,
      ),
    ).toBeVisible({ timeout: 10000 });

    await context.close();
  });
});
