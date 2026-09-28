import { expect, test } from "@playwright/test";
import { MongoClient } from "mongodb";
import { prepareVisualPage, snap } from "./snap";

const STUDENTS_SOURCES = [
  "src/app/admin/(dashboard)/students/page.tsx",
  "src/app/admin/(dashboard)/students/create-student-dialog.tsx",
];
const DIALOG_SOURCES = [
  "src/app/admin/(dashboard)/students/create-student-dialog.tsx",
  "src/app/admin/(dashboard)/students/actions.ts",
];
const USER_ROLES_SOURCES = [
  "src/app/admin/(dashboard)/user-roles/page.tsx",
  "src/app/admin/(dashboard)/user-roles/role-action-buttons.tsx",
];
const JOIN_REQUESTS_SOURCES = [
  "src/app/admin/(dashboard)/join-requests/page.tsx",
  "src/app/admin/(dashboard)/join-requests/pagination-controls.tsx",
];

const MONGODB_URI = `mongodb://localhost:27017/${process.env.E2E_DB_NAME ?? "lms_visual"}`;

// Every account this tour creates carries this prefix, so the cleanup below
// can never touch seeded rows or another agent's captures.
const NS = "people-";
const PASSWORD = "people-visual-qa-123";

const LONG_NAME =
  "[people] Nguyễn Thị Phương Thảo Trần Hoàng Minh Nguyệt Ánh Dương Kim Chi";
const LONG_USERNAME = `${NS}longname`;

const UNBROKEN_NAME =
  "nguyenthiphuongthao.khoahoccoban2026@student.university.edu.vn";
const UNBROKEN_USERNAME = `${NS}khoahoccoban2026.student.university.edu.vn`;

const ADMIN_EMAIL = "votrungquan99@gmail.com";

/**
 * Drops accounts this tour created, and nothing else — the `people-` prefix is
 * asserted, so seeded rows and other agents' rows are unreachable from here.
 * Without it a second run hits "Username already exists" instead of the success
 * state, and repeated runs pile junk into the list everyone else photographs.
 */
async function dropOwnAccounts(usernamePrefix: string): Promise<void> {
  if (!usernamePrefix.startsWith(NS)) {
    throw new Error(`refusing to delete outside the "${NS}" namespace`);
  }
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const users = await db
      .collection("user")
      .find({ email: { $regex: `^${usernamePrefix}` } })
      .toArray();
    const userIds = users.map((u) => u._id);
    // Session first, then account, then user — same order as the app's own
    // rollback, so no live session can outlive the user it points at.
    await db.collection("session").deleteMany({ userId: { $in: userIds } });
    await db.collection("account").deleteMany({ userId: { $in: userIds } });
    await db.collection("user").deleteMany({ _id: { $in: userIds } });
    await db
      .collection("student")
      .deleteMany({ username: { $regex: `^${usernamePrefix}` } });
  } finally {
    await client.close();
  }
}

test.beforeAll(async () => {
  await dropOwnAccounts(NS);
});

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  await prepareVisualPage(page);
});

// Later states read the accounts earlier ones create, so order is load-bearing.
test.describe.configure({ mode: "serial" });

/** The user-roles row for the signed-in owner. */
function ownerRow(page: import("@playwright/test").Page) {
  return page
    .locator("[data-testid^='user-role-row-']")
    .filter({ hasText: ADMIN_EMAIL });
}

/** The dialog's own error banner — Next's route announcer is also role=alert. */
function dialogAlert(page: import("@playwright/test").Page) {
  return page.getByRole("dialog").getByRole("alert");
}

/** Opens the Create Student dialog on an already-loaded students page. */
async function openCreateDialog(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add Student" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Create Student Account" }),
  ).toBeVisible();
}

test("people: students list with every seeded account", async ({ page }) => {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  // Longest seeded name — proof the whole list rendered, not just the header.
  await expect(
    page.getByText("Hank Submitted (MC autograded, free-text pending)"),
  ).toBeVisible();
  await expect(page.getByText("@olive")).toBeVisible();
  await snap(page, "people/students-list-seeded", {
    sources: STUDENTS_SOURCES,
  });
});

test("people: create dialog freshly opened", async ({ page }) => {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  await openCreateDialog(page);
  await expect(
    page.getByRole("button", { name: "Create Student" }),
  ).toBeVisible();
  await snap(page, "people/create-dialog-blank", { sources: DIALOG_SOURCES });
});

test("people: create submitted with every field blank", async ({ page }) => {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  await openCreateDialog(page);
  await page.getByRole("button", { name: "Create Student" }).click();
  // Native `required` blocks the submit and focuses the first invalid field —
  // that focus is the only proof the attempt happened.
  await expect(page.locator("#name")).toBeFocused();
  // Chromium's own validation bubble fades in; snapping mid-fade is unstable.
  await page.waitForTimeout(700);
  await snap(page, "people/create-submitted-empty", {
    sources: DIALOG_SOURCES,
  });
});

test("people: create submitted with whitespace-only fields", async ({
  page,
}) => {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  await openCreateDialog(page);
  // Spaces satisfy `required`/`minLength`, so this is the reachable path to
  // the server's own "All fields are required" refusal.
  await page.getByLabel("Full Name").fill("   ");
  await page.getByLabel("Username").fill("   ");
  await page.getByLabel("Password").fill("        ");
  await page.getByRole("button", { name: "Create Student" }).click();
  await expect(dialogAlert(page)).toContainText("All fields are required");
  await snap(page, "people/create-blank-error", { sources: DIALOG_SOURCES });
});

test("people: create submitted with a username that already exists", async ({
  page,
}) => {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  await openCreateDialog(page);
  await page.getByLabel("Full Name").fill("[people] Duplicate Probe");
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create Student" }).click();
  await expect(dialogAlert(page)).toContainText("Username already exists");
  await snap(page, "people/create-duplicate-username", {
    sources: DIALOG_SOURCES,
  });
});

test("people: create succeeds with a very long name", async ({ page }) => {
  // The dialog occasionally disappears the instant the create succeeds instead
  // of showing its banner (seen once on this shared dev server). Retrying needs
  // a free username, so each attempt starts from a clean row.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await dropOwnAccounts(LONG_USERNAME);
    await page.goto("/admin/students");
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    await openCreateDialog(page);
    await page.getByLabel("Full Name").fill(LONG_NAME);
    await page.getByLabel("Username").fill(LONG_USERNAME);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Student" }).click();
    // The clock is frozen, so the countdown holds at its first value.
    const banner = page.getByText("closing in");
    const arrived = await banner
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (arrived) {
      await snap(page, "people/create-success-countdown", {
        sources: DIALOG_SOURCES,
      });
      return;
    }
  }
  throw new Error("create-success banner never rendered in 3 attempts");
});

test("people: students list with a long spaced name", async ({ page }) => {
  await page.goto("/admin/students");
  await expect(page.getByText(`@${LONG_USERNAME}`)).toBeVisible();
  await snap(page, "people/students-long-name", { sources: STUDENTS_SOURCES });
});

test("people: students list with an unbroken email-like name", async ({
  page,
}) => {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  await openCreateDialog(page);
  await page.getByLabel("Full Name").fill(UNBROKEN_NAME);
  await page.getByLabel("Username").fill(UNBROKEN_USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create Student" }).click();

  // Only the row matters here, so reload until it lands — that survives the
  // dialog vanishing on success without re-submitting a taken username.
  await expect(async () => {
    await page.goto("/admin/students");
    await expect(page.getByText(`@${UNBROKEN_USERNAME}`)).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 40000 });
  await snap(page, "people/students-unbroken-name", {
    sources: STUDENTS_SOURCES,
  });
});

test("people: user roles list", async ({ page }) => {
  await page.goto("/admin/user-roles");
  await expect(page.getByRole("heading", { name: "User Roles" })).toBeVisible();
  // Scoped to the rows: the sidebar account button shows the same email.
  await expect(ownerRow(page)).toBeVisible();
  await expect(
    page.getByText(`${UNBROKEN_USERNAME}@lms.internal`),
  ).toBeVisible();
  await snap(page, "people/user-roles-list", { sources: USER_ROLES_SOURCES });
});

test("people: user roles refuses self-demotion", async ({ page }) => {
  await page.goto("/admin/user-roles");
  await expect(page.getByRole("heading", { name: "User Roles" })).toBeVisible();
  // Own row: the only role action that is safe to actually click, because the
  // server refuses it instead of mutating the shared database.
  await ownerRow(page).getByRole("button", { name: "Revoke admin" }).click();
  await expect(ownerRow(page).getByRole("alert")).toContainText(
    "You cannot remove your own administrator access.",
  );
  await snap(page, "people/user-roles-self-revoke-error", {
    sources: USER_ROLES_SOURCES,
  });
});

test("people: join requests waiting tab is empty", async ({ page }) => {
  await page.goto("/admin/join-requests");
  await expect(
    page.getByRole("heading", { name: "Join Requests" }),
  ).toBeVisible();
  await expect(page.getByText("All caught up.")).toBeVisible();
  await snap(page, "people/join-requests-caught-up", {
    sources: JOIN_REQUESTS_SOURCES,
  });
});

test("people: join requests approved tab is empty", async ({ page }) => {
  await page.goto("/admin/join-requests?filter=approved");
  await expect(
    page.getByRole("heading", { name: "Join Requests" }),
  ).toBeVisible();
  await expect(page.getByText("No requests match.")).toBeVisible();
  await snap(page, "people/join-requests-approved-empty", {
    sources: JOIN_REQUESTS_SOURCES,
  });
});
