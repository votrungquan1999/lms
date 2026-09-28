/**
 * Visual tour: "entry" — every way a person first meets the app (landing,
 * both login screens, invite links, the /redirect hop, permission walls)
 * plus the admin dashboard overview.
 */
import { type Browser, expect, test } from "@playwright/test";
import { prepareVisualPage, snap } from "./snap";

const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3011"}`;

const LANDING_SOURCES = ["src/app/page.tsx"];
const ADMIN_LOGIN_SOURCES = [
  "src/app/admin/login/page.tsx",
  "src/app/admin/login/google-sign-in-button.tsx",
];
const STUDENT_LOGIN_SOURCES = [
  "src/app/student/login/page.tsx",
  "src/app/student/login/student-login-form.tsx",
];
const JOIN_SOURCES = [
  "src/app/join/[token]/page.tsx",
  "src/app/join/[token]/join-page.ui.tsx",
];
const DASHBOARD_SOURCES = [
  "src/app/admin/(dashboard)/dashboard/page.tsx",
  "src/app/admin/(dashboard)/layout.tsx",
];

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  await prepareVisualPage(page);
});

/**
 * Reads the seeded course's live invite path through the admin UI, minting one
 * only if the course has none. No new course row, no renamed seeded row.
 * @param browser - the test's browser, used for a throwaway admin context
 * @returns the "/join/<token>" path
 */
async function harvestInvitePath(browser: Browser): Promise<string> {
  const context = await browser.newContext({
    storageState: "playwright/.auth/admin.json",
    baseURL: BASE_URL,
  });
  try {
    const adminPage = await context.newPage();
    await adminPage.goto("/admin/courses/seed-course-fundamentals");
    await expect(
      adminPage.getByRole("heading", { name: "Sandbox: Fundamentals" }),
    ).toBeVisible();

    const getLink = adminPage.getByRole("button", { name: "Get Join Link" });
    if (await getLink.isVisible()) {
      await getLink.click();
    }

    const code = adminPage.locator("code").first();
    await expect(code).toBeVisible({ timeout: 15000 });
    return (await code.innerText()).trim();
  } finally {
    await context.close();
  }
}

test.describe("entry — admin session", () => {
  test("entry: admin dashboard overview", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.locator("[data-stat='students-waiting']")).toBeVisible();
    await snap(page, "entry/admin-dashboard", { sources: DASHBOARD_SOURCES });
  });
});

test.describe("entry — logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("entry: landing page", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Learning Management System" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Student Login" }),
    ).toBeVisible();
    await snap(page, "entry/landing", { sources: LANDING_SOURCES });
  });

  test("entry: admin login", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByText("Admin Login")).toBeVisible();
    await snap(page, "entry/admin-login", { sources: ADMIN_LOGIN_SOURCES });
  });

  test("entry: student login", async ({ page }) => {
    await page.goto("/student/login");
    await expect(page.getByText("Student Login")).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await snap(page, "entry/student-login", { sources: STUDENT_LOGIN_SOURCES });
  });

  test("entry: student login submitted with both fields empty", async ({
    page,
  }) => {
    await page.goto("/student/login");
    await expect(page.getByLabel("Username")).toBeVisible();

    await page.getByRole("button", { name: "Sign In" }).click();

    // Constraint validation blocks the submit and focuses the first invalid
    // control — that focus move is the proof the click was handled.
    await expect(page.locator("#username")).toBeFocused();
    await snap(page, "entry/student-login-empty-submit", {
      sources: STUDENT_LOGIN_SOURCES,
    });
  });

  test("entry: student login with a whitespace-only username", async ({
    page,
  }) => {
    await page.goto("/student/login");
    await page.getByLabel("Username").fill("   ");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.locator("p[role='alert']")).toHaveText(
      "Username and password are required",
    );
    await snap(page, "entry/student-login-blank-username", {
      sources: STUDENT_LOGIN_SOURCES,
    });
  });

  test("entry: student login with wrong credentials", async ({ page }) => {
    await page.goto("/student/login");
    await page.getByLabel("Username").fill("no-such-student");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.locator("p[role='alert']")).toHaveText(
      "Invalid username or password",
      { timeout: 15000 },
    );
    await snap(page, "entry/student-login-wrong-credentials", {
      sources: STUDENT_LOGIN_SOURCES,
    });
  });

  test("entry: stale invite link with an unknown token", async ({ page }) => {
    await page.goto("/join/this-token-does-not-exist");
    await expect(page.getByText("Invitation no longer valid")).toBeVisible();
    await snap(page, "entry/join-invalid-token", { sources: JOIN_SOURCES });
  });

  test("entry: live invite link", async ({ browser, page }) => {
    const joinPath = await harvestInvitePath(browser);
    expect(joinPath).toMatch(/^\/join\//);

    await page.goto(joinPath);
    await expect(page.getByText("You're invited to join")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Account" }),
    ).toBeVisible();
    await snap(page, "entry/join-valid-token", {
      sources: [
        ...JOIN_SOURCES,
        "src/app/join/[token]/self-signup-form.tsx",
        "src/app/join/[token]/google-join-button.tsx",
      ],
    });
  });

  test("entry: /redirect with no session", async ({ page }) => {
    const response = await page.goto("/redirect");
    // Documented as-is, not worked around: this route 500s for a signed-out
    // visitor instead of landing on "/".
    expect(response?.status()).toBe(500);
    await expect(
      page.getByText("Application error: a server-side exception has occurred"),
    ).toBeVisible();
    await snap(page, "entry/redirect-logged-out", {
      sources: ["src/app/redirect/page.tsx"],
    });
  });

  test("entry: admin URL opened with no session", async ({ page }) => {
    await page.goto("/admin/students");
    await expect(page.getByText("Admin Login")).toBeVisible();
    await snap(page, "entry/admin-url-logged-out", {
      sources: [
        "src/proxy.ts",
        "src/lib/page-guard.ts",
        ...ADMIN_LOGIN_SOURCES,
      ],
    });
  });
});

test.describe("entry — student session", () => {
  test.use({ storageState: "playwright/.auth/student.json" });

  test("entry: admin URL opened by a student", async ({ page }) => {
    await page.goto("/admin/students");
    await expect(
      page.getByRole("heading", { name: "Access Denied" }),
    ).toBeVisible();
    await snap(page, "entry/admin-url-forbidden", {
      sources: ["src/app/forbidden.tsx", "src/lib/page-guard.ts"],
    });
  });
});
