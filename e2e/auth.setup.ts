import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";

const authDir = path.join(__dirname, "../playwright/.auth");
const BASE_URL = "http://localhost:3001";

// Must match ADMIN_EMAILS in .env.local
const ADMIN_EMAIL = "votrungquan99@gmail.com";
const ADMIN_PASSWORD = "e2e-admin-password-123";

setup.describe("auth setup", () => {
  setup.beforeAll(() => {
    fs.mkdirSync(authDir, { recursive: true });
  });

  setup("authenticate as admin", async ({ page }) => {
    // Sign up admin via Better Auth API (bypasses Google OAuth)
    const signUpResponse = await page.request.post(
      `${BASE_URL}/api/auth/sign-up/email`,
      {
        data: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          name: "Test Admin",
        },
      },
    );

    if (!signUpResponse.ok()) {
      // User already exists — sign in instead
      const signInResponse = await page.request.post(
        `${BASE_URL}/api/auth/sign-in/email`,
        {
          data: {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
          },
        },
      );
      expect(signInResponse.ok()).toBeTruthy();
    }

    // Navigate to verify session is active
    await page.goto(`${BASE_URL}/`);

    // Save authenticated state
    await page.context().storageState({
      path: path.join(authDir, "admin.json"),
    });

    console.log("[auth setup] Admin auth state saved");
  });
});
