import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { MongoClient } from "mongodb";
import { E2E_MONGODB_URI } from "./mongodb-uri";

const authDir = path.join(__dirname, "../playwright/.auth");
// Must follow playwright.config.ts's E2E_PORT, or this spec would drive a
// different server than the one the suite started.
const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3001"}`;

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

    // The role model defaults every signup to "student" (input: false on the
    // role field blocks setting it through the signup body itself), so the
    // bootstrapped user needs a direct write to actually be an admin. The
    // "admin" literal must track Role.Admin in src/lib/session.ts (D40).
    const client = new MongoClient(E2E_MONGODB_URI);
    try {
      await client.connect();
      const result = await client
        .db()
        .collection("user")
        .updateOne({ email: ADMIN_EMAIL }, { $set: { role: "admin" } });
      // A 0-match write leaves this user "student" and every admin test fails
      // far away with no pointer back to this step — fail loudly here instead.
      expect(result.matchedCount).toBe(1);
    } finally {
      await client.close();
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
