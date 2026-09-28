import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { MongoClient } from "mongodb";

/**
 * Auth bootstrap for the visual-QA run. Deliberately separate from
 * e2e/auth.setup.ts: that one runs against the e2e database, which
 * global-setup drops on every run. The visual run keeps its seeded database
 * (scripts/seed-test-states.ts), so it needs its own bootstrap.
 */

const authDir = path.join(__dirname, "../../playwright/.auth");
const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "3011"}`;
const MONGODB_URI = `mongodb://localhost:27017/${
  process.env.E2E_DB_NAME ?? "lms_visual"
}`;

// Must match ADMIN_EMAILS in .env.local
const ADMIN_EMAIL = "votrungquan99@gmail.com";
const ADMIN_PASSWORD = "visual-qa-admin-123";

// A long, space-separated name — the stress inputs that break layouts live in
// the tours, not here; this one only has to be realistic.
const STUDENT_NAME = "Nguyen Thi Phuong Thao";
const STUDENT_USERNAME = "visual-student";
const STUDENT_PASSWORD = "visual-qa-student-123";

const SEED_COURSE_TITLE = "Sandbox: Fundamentals";

setup.describe.configure({ mode: "serial" });

setup("authenticate as admin", async ({ page }) => {
  fs.mkdirSync(authDir, { recursive: true });

  const signUp = await page.request.post(`${BASE_URL}/api/auth/sign-up/email`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: "Visual QA Admin",
    },
  });

  if (!signUp.ok()) {
    const signIn = await page.request.post(
      `${BASE_URL}/api/auth/sign-in/email`,
      {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      },
    );
    expect(signIn.ok()).toBeTruthy();
  }

  // Signup always yields "student" (the role field is input:false), so the
  // bootstrapped user needs a direct write to actually be an admin.
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const result = await client
      .db()
      .collection("user")
      .updateOne({ email: ADMIN_EMAIL }, { $set: { role: "admin" } });
    // A 0-match write leaves this user a student and every admin capture is
    // silently an access-denied page instead.
    expect(result.matchedCount).toBe(1);
  } finally {
    await client.close();
  }

  await page.goto(`${BASE_URL}/`);
  await page.context().storageState({ path: path.join(authDir, "admin.json") });
});

setup("create and authenticate a student", async ({ browser }) => {
  const adminContext = await browser.newContext({
    storageState: path.join(authDir, "admin.json"),
  });
  const admin = await adminContext.newPage();

  await admin.goto(`${BASE_URL}/admin/students`);
  await expect(admin.getByRole("heading", { name: "Students" })).toBeVisible();

  const alreadyExists = await admin
    .getByText(`@${STUDENT_USERNAME}`)
    .isVisible()
    .catch(() => false);

  if (!alreadyExists) {
    await admin.getByRole("button", { name: "Add Student" }).first().click();
    await admin.getByLabel("Full Name").fill(STUDENT_NAME);
    await admin.getByLabel("Username").fill(STUDENT_USERNAME);
    await admin.getByLabel("Password").fill(STUDENT_PASSWORD);
    await admin.getByRole("button", { name: "Create Student" }).click();
    await expect(admin.getByText("created successfully")).toBeVisible({
      timeout: 15000,
    });
    await admin.keyboard.press("Escape");

    // Enrol into the seeded course, or the student dashboard is empty and the
    // student-side tours have nothing to walk into.
    await admin.goto(`${BASE_URL}/admin/courses/seed-course-fundamentals`);
    await expect(
      admin.getByRole("heading", { name: SEED_COURSE_TITLE }),
    ).toBeVisible();
    await admin.getByRole("button", { name: "Manage Enrollments" }).click();
    await expect(
      admin.getByRole("heading", { name: "Manage Enrollments" }),
    ).toBeVisible();
    await admin.getByText(`@${STUDENT_USERNAME}`).click();
    await admin.getByRole("button", { name: "Confirm Enrollments" }).click();
    await expect(admin.getByText("updated")).toBeVisible({ timeout: 15000 });
  }

  await adminContext.close();

  // storageState: undefined, or this context inherits the admin session.
  const studentContext = await browser.newContext({ storageState: undefined });
  const student = await studentContext.newPage();
  await student.goto(`${BASE_URL}/student/login`);
  await student.getByLabel("Username").fill(STUDENT_USERNAME);
  await student.getByLabel("Password").fill(STUDENT_PASSWORD);
  await student.getByRole("button", { name: "Sign In" }).click();
  await student.waitForURL("**/student/dashboard", { timeout: 15000 });

  await studentContext.storageState({
    path: path.join(authDir, "student.json"),
  });
  await studentContext.close();
});
