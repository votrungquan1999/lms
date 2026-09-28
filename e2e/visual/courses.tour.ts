import { expect, type Page, test } from "@playwright/test";
import { prepareVisualPage, snap } from "./snap";

const LIST_SOURCES = [
  "src/app/admin/(dashboard)/courses/page.tsx",
  "src/app/admin/(dashboard)/courses/create-course-form.tsx",
];
const DETAIL_SOURCES = [
  "src/app/admin/(dashboard)/courses/[courseId]/page.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/share-invite-link.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/materials-section.tsx",
  "src/app/admin/(dashboard)/@breadcrumb/courses/[courseId]/page.tsx",
];
const ENROLL_SOURCES = [
  "src/app/admin/(dashboard)/courses/[courseId]/enroll-student-form.tsx",
];
const REPORT_SOURCES = [
  "src/app/admin/(dashboard)/courses/[courseId]/results-report/page.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/results-report/results-report-selection.ui.tsx",
];

const SEED_COURSE_ID = "seed-course-fundamentals";
const SEED_TEST_TITLE = "Sandbox: All visibility ON";
const REAL_STUDENT_NAME = "Nguyen Thi Phuong Thao";

// Namespaced so other features' captures are not polluted, and stable across
// runs so re-running this tour reuses the rows instead of piling up new ones.
const EMPTY_TITLE = "[courses] Empty Course";
const LONG_TITLE =
  "[courses] Nhập môn Cấu trúc dữ liệu và Giải thuật nâng cao cho sinh viên năm hai";
const LONG_DESC =
  "Học phần cung cấp kiến thức nền tảng về cấu trúc dữ liệu, thuật toán sắp xếp và tìm kiếm, độ phức tạp tính toán và cách áp dụng vào các bài toán thực tế của ngành công nghệ thông tin.";
const UNBROKEN_TITLE =
  "[courses] nguyenthiphuongthao.khoahoccoban2026@student.university.edu.vn";
const UNBROKEN_DESC =
  "https://lms.university.edu.vn/khoahoccoban2026/decuongchitiethocphan/nguyenthiphuongthao.tailieuthamkhao.pdf";

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  await prepareVisualPage(page);
});

/** Locates a course card on the list page by its title. */
function courseCard(page: Page, title: string) {
  return page.locator('a[href^="/admin/courses/"]').filter({ hasText: title });
}

/**
 * Creates the named course only if it is not already there, so repeated runs
 * against the shared seeded database reuse one row.
 * @returns the course id
 */
async function ensureCourse(
  page: Page,
  title: string,
  description: string,
): Promise<string> {
  await page.goto("/admin/courses");
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

  const card = courseCard(page, title);
  if ((await card.count()) === 0) {
    await page.getByRole("button", { name: "Add Course" }).click();
    await page.getByLabel("Course Title").fill(title);
    if (description) await page.getByLabel("Description").fill(description);
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 20000,
    });
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(card).toHaveCount(1, { timeout: 20000 });
  }

  const href = await card.first().getAttribute("href");
  if (!href) throw new Error(`no href on the card for "${title}"`);
  return href.split("/").pop() as string;
}

test("courses: list with the seeded course and the stress-titled ones", async ({
  page,
}) => {
  await ensureCourse(page, EMPTY_TITLE, "");
  await ensureCourse(page, LONG_TITLE, LONG_DESC);
  await ensureCourse(page, UNBROKEN_TITLE, UNBROKEN_DESC);

  await page.goto("/admin/courses");
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
  await expect(courseCard(page, UNBROKEN_TITLE)).toHaveCount(1);
  await expect(courseCard(page, "Sandbox: Fundamentals")).toHaveCount(1);
  await snap(page, "courses/list", { sources: LIST_SOURCES });
});

test("courses: create dialog opened blank", async ({ page }) => {
  await page.goto("/admin/courses");
  await page.getByRole("button", { name: "Add Course" }).click();
  await expect(
    page.getByRole("heading", { name: "Create Course" }),
  ).toBeVisible();
  await snap(page, "courses/create-dialog-blank", { sources: LIST_SOURCES });
});

test("courses: create submitted with a blank title", async ({ page }) => {
  await page.goto("/admin/courses");
  await page.getByRole("button", { name: "Add Course" }).click();
  await expect(
    page.getByRole("heading", { name: "Create Course" }),
  ).toBeVisible();
  // Whitespace, not "": the input is `required`, so a truly empty submit is
  // stopped by the browser and never reaches the action's validation.
  await page.getByLabel("Course Title").fill("   ");
  await page.getByRole("button", { name: "Create Course" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Course title is required",
    { timeout: 20000 },
  );
  await snap(page, "courses/create-invalid", {
    sources: [...LIST_SOURCES, "src/app/admin/(dashboard)/courses/actions.ts"],
  });
});

test("courses: seeded course detail with enrollments and tests", async ({
  page,
}) => {
  await page.goto(`/admin/courses/${SEED_COURSE_ID}`);
  await expect(
    page.getByRole("heading", { name: "Sandbox: Fundamentals" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("heading", { name: /Enrolled Students \(\d+\)/ }),
  ).toBeVisible();
  await expect(page.getByText(SEED_TEST_TITLE)).toBeVisible();
  await snap(page, "courses/detail-seeded", { sources: DETAIL_SOURCES });
});

test("courses: fresh course detail with no students, materials or tests", async ({
  page,
}) => {
  const courseId = await ensureCourse(page, EMPTY_TITLE, "");
  await page.goto(`/admin/courses/${courseId}`);
  await expect(page.getByRole("heading", { name: EMPTY_TITLE })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("No students enrolled yet.")).toBeVisible();
  await expect(page.getByText("No tests yet. Create one above.")).toBeVisible();
  await snap(page, "courses/detail-empty", { sources: DETAIL_SOURCES });
});

test("courses: detail of a course with a very long spaced title", async ({
  page,
}) => {
  const courseId = await ensureCourse(page, LONG_TITLE, LONG_DESC);
  await page.goto(`/admin/courses/${courseId}`);
  await expect(page.getByRole("heading", { name: LONG_TITLE })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("No tests yet. Create one above.")).toBeVisible();
  await snap(page, "courses/detail-long-title", { sources: DETAIL_SOURCES });
});

test("courses: detail of a course titled with one unbroken string", async ({
  page,
}) => {
  const courseId = await ensureCourse(page, UNBROKEN_TITLE, UNBROKEN_DESC);
  await page.goto(`/admin/courses/${courseId}`);
  await expect(page.getByRole("heading", { name: UNBROKEN_TITLE })).toBeVisible(
    { timeout: 30000 },
  );
  await expect(page.getByText(UNBROKEN_DESC)).toBeVisible();
  await snap(page, "courses/detail-unbroken-title", {
    sources: DETAIL_SOURCES,
  });
});

test("courses: manage enrollments dialog listing every student", async ({
  page,
}) => {
  await page.goto(`/admin/courses/${SEED_COURSE_ID}`);
  await expect(
    page.getByRole("heading", { name: "Sandbox: Fundamentals" }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Manage Enrollments" }).click();
  await expect(
    page.getByRole("heading", { name: "Manage Enrollments" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("@visual-student")).toBeAttached();
  await expect(
    dialog.getByRole("button", { name: "Confirm Enrollments" }),
  ).toBeVisible();
  await snap(page, "courses/enrollments-dialog", {
    sources: [
      ...ENROLL_SOURCES,
      "src/app/admin/(dashboard)/courses/[courseId]/page.tsx",
    ],
  });
});

test("courses: manage enrollments on a course with nobody enrolled", async ({
  page,
}) => {
  const courseId = await ensureCourse(page, EMPTY_TITLE, "");
  await page.goto(`/admin/courses/${courseId}`);
  await expect(page.getByRole("heading", { name: EMPTY_TITLE })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Manage Enrollments" }).click();
  await expect(
    page.getByRole("heading", { name: "Manage Enrollments" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("@visual-student")).toBeAttached();
  await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await snap(page, "courses/enrollments-none-ticked", {
    sources: [
      ...ENROLL_SOURCES,
      "src/app/admin/(dashboard)/courses/[courseId]/page.tsx",
    ],
  });
});

test("courses: results report for the seeded course with nothing picked", async ({
  page,
}) => {
  await page.goto(`/admin/courses/${SEED_COURSE_ID}/results-report`);
  await expect(
    page.getByRole("heading", { name: "Export Results" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(SEED_TEST_TITLE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeDisabled();
  await snap(page, "courses/results-report", { sources: REPORT_SOURCES });
});

test("courses: results report with a student and a test picked", async ({
  page,
}) => {
  await page.goto(`/admin/courses/${SEED_COURSE_ID}/results-report`);
  await expect(
    page.getByRole("heading", { name: "Export Results" }),
  ).toBeVisible({ timeout: 30000 });
  // Clicking the <label> toggles its control without depending on how Radix
  // exposes the radio/checkbox accessible name.
  await page.getByText(REAL_STUDENT_NAME, { exact: true }).click();
  await page.getByText(SEED_TEST_TITLE, { exact: true }).click();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  await snap(page, "courses/results-report-selected", {
    sources: REPORT_SOURCES,
  });
});

test("courses: results report for a course with no students and no tests", async ({
  page,
}) => {
  const courseId = await ensureCourse(page, EMPTY_TITLE, "");
  await page.goto(`/admin/courses/${courseId}/results-report`);
  await expect(
    page.getByRole("heading", { name: "Export Results" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Tests" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeDisabled();
  await snap(page, "courses/results-report-empty", { sources: REPORT_SOURCES });
});
