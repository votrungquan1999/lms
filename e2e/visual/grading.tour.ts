/**
 * Visual-QA tour: grading.
 *
 * Routes covered:
 *   /admin/grading                                        (hub)
 *   /admin/grading/[testId]                               (grading shell)
 *   /admin/courses/[courseId]/tests/[testId]/grading      (course-scoped shell)
 *
 * Seeded rows are read-only here. The mutations are a throwaway test inside
 * a "[grading]"-namespaced sandbox course, recreated on every run so the
 * release-control capture is reproducible, and two "[grading]" tests (a photo
 * answer, a graded hand-in) seeded under fixed ids and removed after the run, so
 * the hub and the To grade count look the same on every run.
 */
import zlib from "node:zlib";
import { expect, type Locator, type Page, test } from "@playwright/test";
import type { Db } from "mongodb";
import {
  enroll,
  insertAnnotation,
  insertAnswer,
  insertCourse,
  insertGrade,
  insertQuestion,
  insertStudent,
  insertSubmission,
  insertTest,
  withDb,
} from "../seed";
import { prepareVisualPage, snap } from "./snap";

const HUB = ["src/app/admin/(dashboard)/grading/page.tsx"];

const SHELL = [
  "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.ui.tsx",
  "src/app/admin/(dashboard)/grading/page-body/student-picker.tsx",
  "src/app/admin/(dashboard)/grading/page-body/student-picker.ui.tsx",
];

const STUDENT_DETAIL = [
  ...SHELL,
  "src/app/admin/(dashboard)/grading/page-body/grading-top-bar.ui.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grade-panel.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grade-panel.ui.tsx",
  "src/app/admin/(dashboard)/grading/page-body/answer-pane.tsx",
  "src/app/admin/(dashboard)/grading/page-body/question-row.tsx",
  "src/app/admin/(dashboard)/grading/page-body/grading-detail-student.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
  "src/app/admin/(dashboard)/grading/page-body/more-menu.tsx",
];

const TEST_ID = "seed-test-visible";
const HIDDEN_TEST_ID = "seed-test-hidden";
const COURSE_ID = "seed-course-fundamentals";
const VARIANT_PATH = `/admin/grading/${TEST_ID}`;

// Namespaced so other agents' captures stay clean. The test title is the
// unbroken-string stress value; the course title is the long-with-spaces one.
const SANDBOX_COURSE =
  "[grading] Nhập môn Cấu trúc dữ liệu và Giải thuật nâng cao cho sinh viên năm hai";
const SANDBOX_TEST =
  "[grading] nguyenthiphuongthao.khoahoccoban2026@student.university.edu.vn";

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  // The shell fans out per-student service calls for 16 enrolled students.
  test.setTimeout(120_000);
  await prepareVisualPage(page);
});

/** Opens the variant grading page and waits for the student picker. */
async function openVariantRoster(page: Page): Promise<void> {
  await page.goto(VARIANT_PATH);
  await expect(
    page.getByRole("heading", { name: "Grade: Sandbox: All visibility ON" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: "Student picker" }),
  ).toBeVisible({ timeout: 60_000 });
}

/** Picks a student by name from the student picker and waits for that student's detail card. */
async function focusStudent(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Student picker" }).click();
  await page.getByRole("menuitem").filter({ hasText: name }).first().click();
  // A still-writing student asks first; the tour confirms to reach her.
  const gradeAnyway = page.getByRole("button", { name: "Grade anyway" });
  if (await gradeAnyway.isVisible()) await gradeAnyway.click();
  await expect(
    page
      .getByTestId("grading-main-pane")
      .locator(`[data-student-name="${name}"]`),
  ).toBeVisible({ timeout: 60_000 });
}

/** A link's href, guarded so a missing attribute fails loudly. */
async function hrefOf(locator: Locator): Promise<string> {
  const href = await locator.getAttribute("href");
  if (!href) throw new Error("Expected the link to carry an href");
  return href;
}

/** Creates the sandbox course on first run, then returns its id. */
async function ensureSandboxCourse(page: Page): Promise<string> {
  await page.goto("/admin/courses");
  await expect(
    page.getByRole("heading", { name: "Courses", exact: true }),
  ).toBeVisible();

  const courseLink = page
    .locator('a[href^="/admin/courses/"]')
    .filter({ hasText: SANDBOX_COURSE });

  if ((await courseLink.count()) === 0) {
    await page.getByRole("button", { name: "New course" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Course Title").fill(SANDBOX_COURSE);
    await dialog
      .getByLabel("Description")
      .fill("[grading] Visual QA sandbox — deliberately has no students.");
    await dialog.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText("created successfully")).toBeVisible({
      timeout: 30_000,
    });
    await page.goto("/admin/courses");
  }

  const href = await hrefOf(courseLink.first());
  return href.split("/").pop() as string;
}

/**
 * Deletes the sandbox test if a previous run left one behind, then creates it
 * fresh with grades withheld. A released test can never show the unreleased
 * control again, so the row has to start clean on every run.
 */
async function recreateSandboxTest(
  page: Page,
  courseId: string,
): Promise<string> {
  const testLink = () =>
    page
      .locator(`a[href^="/admin/courses/${courseId}/tests/"]`)
      .filter({ hasText: SANDBOX_TEST });

  await page.goto(`/admin/courses/${courseId}`);

  if ((await testLink().count()) > 0) {
    await page.goto(await hrefOf(testLink().first()));
    await page.getByRole("button", { name: "Delete Test" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(async () => {
      await page.goto(`/admin/courses/${courseId}`);
      await expect(testLink()).toHaveCount(0);
    }).toPass({ timeout: 30_000 });
  }

  await page.getByRole("button", { name: "New test" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Test Title").fill(SANDBOX_TEST);
  await dialog
    .getByRole("checkbox", { name: "Show grades immediately" })
    .uncheck();
  await dialog.getByRole("button", { name: "Create Test" }).click();
  await expect(page.getByText("created successfully")).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`/admin/courses/${courseId}`);
  await expect(testLink()).toHaveCount(1);
  const href = await hrefOf(testLink().first());
  return href.split("/").pop() as string;
}

// ── Hub ─────────────────────────────────────────────────────────────────────

test("grading: hub lists a test that needs grading", async ({ page }) => {
  await page.goto("/admin/grading");
  await expect(page.getByRole("heading", { name: "To grade" })).toBeVisible();
  await expect(page.getByTestId(`hub-test-card-${TEST_ID}`)).toBeVisible({
    timeout: 60_000,
  });
  await snap(page, "grading/hub-needs-grading", { sources: HUB });
});

// ── Per-test roster (the many-items case) ───────────────────────────────────

test("grading: workspace opens on the first student to grade", async ({
  page,
}) => {
  await openVariantRoster(page);
  await snap(page, "grading/workspace-student", { sources: STUDENT_DETAIL });
});

test("grading: student still in progress", async ({ page }) => {
  await openVariantRoster(page);
  await focusStudent(page, "Bob InProgress");
  await snap(page, "grading/student-in-progress", { sources: STUDENT_DETAIL });
});

test("grading: confirm dialog when picking an in-progress student", async ({
  page,
}) => {
  await openVariantRoster(page);
  await page.getByRole("button", { name: "Student picker" }).click();
  await page
    .getByRole("menuitem")
    .filter({ hasText: "Bob InProgress" })
    .first()
    .click();
  // "Grade anyway" is never clicked, so the screen stays on the open student.
  await expect(
    page.getByRole("alertdialog").getByText("is still writing. Grade anyway?"),
  ).toBeVisible();
  await snap(page, "grading/grade-in-progress-confirm", {
    sources: [
      ...STUDENT_DETAIL,
      "src/app/admin/(dashboard)/grading/page-body/still-writing-confirm.tsx",
      "src/components/ui/alert-dialog.tsx",
    ],
  });
});

test("grading: submitted student with a blank free-text answer", async ({
  page,
}) => {
  await openVariantRoster(page);
  await focusStudent(page, "Dan Submitted (blank free-text)");
  await expect(
    page.getByTestId("grade-card").getByText(/^No answer/),
  ).toBeVisible();
  await snap(page, "grading/student-blank-free-text", {
    sources: [
      ...STUDENT_DETAIL,
      "src/app/admin/(dashboard)/grading/page-body/more-menu.tsx",
    ],
  });
});

test("grading: fully graded student", async ({ page }) => {
  await openVariantRoster(page);
  await focusStudent(page, "Frank Graded (all answered)");
  await snap(page, "grading/student-graded", { sources: STUDENT_DETAIL });
});

test("grading: student with an active redo request", async ({ page }) => {
  await openVariantRoster(page);
  await focusStudent(page, "Ivy Graded with active redo request");
  await expect(
    page
      .getByTestId("grading-main-pane")
      .getByText(/read-only while the redo is open/),
  ).toBeVisible();
  await snap(page, "grading/student-redo-requested", {
    sources: STUDENT_DETAIL,
  });
});

test("grading: student with an existing AI grade suggestion", async ({
  page,
}) => {
  await openVariantRoster(page);
  await focusStudent(
    page,
    "Noah Submitted with existing AI suggestion (test Regenerate)",
  );
  await expect(page.getByTestId("ai-suggestion-panel")).toBeVisible({
    timeout: 60_000,
  });
  await snap(page, "grading/student-ai-suggestion", {
    sources: [
      ...STUDENT_DETAIL,
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-suggestion-panel.tsx",
      "src/app/admin/(dashboard)/grading/page-body/more-menu.tsx",
    ],
  });
});

test("grading: workspace by question", async ({ page }) => {
  await page.goto(`${VARIANT_PATH}?mode=question`);
  await expect(
    page.getByRole("button", { name: "Question picker" }),
  ).toBeVisible({ timeout: 60_000 });
  await snap(page, "grading/workspace-question", {
    sources: [
      "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
      "src/app/admin/(dashboard)/grading/page-body/question-picker.ui.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-detail-question.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
    ],
  });
});

// ── Course-scoped route ─────────────────────────────────────────────────────

test("grading: course-scoped page with the release controls", async ({
  page,
}) => {
  await page.goto(
    `/admin/courses/${COURSE_ID}/tests/${HIDDEN_TEST_ID}/grading`,
  );
  await expect(page.getByTestId("grading-top-bar")).toContainText(
    "Sandbox: All visibility OFF",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: /^Release .+▾$/ }).click();
  await expect(
    page.getByRole("menuitem", { name: /Release grades…/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /Release correct answers/ }),
  ).toBeVisible();
  await snap(page, "grading/course-scoped-unreleased", {
    sources: [
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/page.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-detail-student.tsx",
      "src/app/admin/(dashboard)/grading/page-body/student-picker.ui.tsx",
    ],
  });
});

// ── Sandbox course: empty roster, unbroken title, release confirmation ──────

test("grading: empty roster and the grade-release control", async ({
  page,
}) => {
  const courseId = await ensureSandboxCourse(page);
  const testId = await recreateSandboxTest(page, courseId);

  await page.goto(`/admin/grading/${testId}`);
  await expect(
    page.getByText("No students enrolled in this course yet."),
  ).toBeVisible({ timeout: 60_000 });
  await snap(page, "grading/empty-roster-unbroken-title", {
    sources: [
      "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.tsx",
      "src/app/admin/(dashboard)/grading/page-body/grading-page-shell.ui.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
    ],
  });

  // Releasing revalidates the page, so the chip reads Released.
  await page.getByRole("button", { name: /^Release .+▾$/ }).click();
  await page.getByRole("menuitem", { name: /Release grades…/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Release" })
    .click();
  await expect(page.getByTestId("release-state")).toHaveText("Released", {
    timeout: 30_000,
  });
  await snap(page, "grading/grades-released", {
    sources: [
      "src/app/admin/(dashboard)/grading/[testId]/page.tsx",
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms.tsx",
    ],
  });
});

// ── Photo answers and the tablet layout ─────────────────────────────────────

/** A grey PNG with a darker frame, enough to see where marks sit on it. */
function framedPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf)
      c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(1 + width * 3, 225);
    row[0] = 0;
    const edge = y < 6 || y >= height - 6;
    for (let x = 0; x < width; x++) {
      if (edge || x < 6 || x >= width - 6) row.fill(120, 1 + x * 3, 4 + x * 3);
    }
    return row;
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Fixed ids for one seeded "[grading]" test, its course, question and student. */
interface SeededIds {
  courseId: string;
  testId: string;
  questionId: string;
  studentId: string;
}

/** Ids for the seeded test named `key`; fixed, so a run also clears rows an interrupted run left behind. */
function seededIds(key: string): SeededIds {
  return {
    courseId: `visual-grading-${key}-course`,
    testId: `visual-grading-${key}-test`,
    questionId: `visual-grading-${key}-question`,
    studentId: `visual-grading-${key}-student`,
  };
}

/** Deletes every row seeded under these ids. */
async function clearSeeded(db: Db, ids: SeededIds): Promise<void> {
  for (const name of [
    "answer",
    "test_submission",
    "annotation",
    "grade",
    "question",
  ]) {
    await db.collection(name).deleteMany({ testId: ids.testId });
  }
  await db.collection("test").deleteMany({ id: ids.testId });
  await db.collection("enrollment").deleteMany({ courseId: ids.courseId });
  await db.collection("course").deleteMany({ id: ids.courseId });
  await db.collection("student").deleteMany({ id: ids.studentId });
}

/** Seeds one handed-in answer to a one-question "[grading]" test, in the school that owns the sandbox course. */
async function seedHandIn(
  db: Db,
  ids: SeededIds,
  fields: {
    title: string;
    studentName: string;
    type: "image_answer" | "free_text";
    showGradeAfterSubmit: boolean;
  },
): Promise<void> {
  // The visual database's admin works in the school that owns the seeded course.
  const sandbox = await db.collection("course").findOne({ id: COURSE_ID });
  const schoolId = sandbox?.schoolId as string;
  await clearSeeded(db, ids);
  await insertCourse(db, {
    id: ids.courseId,
    title: `${fields.title} course`,
    schoolId,
  });
  await insertTest(db, ids.courseId, {
    id: ids.testId,
    title: fields.title,
    showGradeAfterSubmit: fields.showGradeAfterSubmit,
    schoolId,
  });
  await insertQuestion(db, ids.testId, {
    id: ids.questionId,
    title: `${fields.title} question`,
    type: fields.type,
  });
  await insertStudent(db, {
    id: ids.studentId,
    name: fields.studentName,
    // A fixed username: the default random one would change the snap on every run.
    username: ids.studentId,
    schoolIds: [schoolId],
  });
  await enroll(db, { courseId: ids.courseId, studentId: ids.studentId });
}

/** One handed-in photo answer with a stroke and a text mark already saved. */
async function seedPhotoAnswer(): Promise<SeededIds> {
  const ids = seededIds("photos");
  await withDb(async (db) => {
    await seedHandIn(db, ids, {
      title: "[grading] Photos",
      studentName: "Photo Student",
      type: "image_answer",
      showGradeAfterSubmit: true,
    });
    const mediaKey = `answers/${ids.studentId}/p1.png`;
    await insertAnswer(db, {
      testId: ids.testId,
      questionId: ids.questionId,
      studentId: ids.studentId,
      answer: { type: "image", mediaKeys: [mediaKey] },
    });
    await insertSubmission(db, {
      testId: ids.testId,
      studentId: ids.studentId,
    });
    await insertAnnotation(db, {
      testId: ids.testId,
      questionId: ids.questionId,
      studentId: ids.studentId,
      entries: [
        {
          mediaKey,
          strokes: [
            {
              color: "#ef4444",
              points: [
                { x: 0.2, y: 0.2 },
                { x: 0.6, y: 0.5 },
              ],
            },
          ],
          texts: [
            { x: 0.3, y: 0.7, text: "check this step", color: "#2563eb" },
          ],
        },
      ],
    });
  });
  return ids;
}

/** One hand-in whose only answer is graded but not released, so the finish panel shows with Release…. */
async function seedGradedHandIn(): Promise<SeededIds> {
  const ids = seededIds("done");
  await withDb(async (db) => {
    await seedHandIn(db, ids, {
      title: "[grading] Done",
      studentName: "Done Student",
      type: "free_text",
      // Grades held back, so the finish panel offers Release…
      showGradeAfterSubmit: false,
    });
    // The answer predates its grade, so the grade counts as current.
    await insertAnswer(db, {
      testId: ids.testId,
      questionId: ids.questionId,
      studentId: ids.studentId,
      answer: { type: "free_text", text: "print(sum(range(1, 6)))" },
      submittedAt: new Date(Date.now() - 60_000),
    });
    await insertSubmission(db, {
      testId: ids.testId,
      studentId: ids.studentId,
    });
    await insertGrade(db, {
      testId: ids.testId,
      questionId: ids.questionId,
      studentId: ids.studentId,
      score: 100,
      feedback: "Correct and clear.",
    });
  });
  return ids;
}

test.afterAll(async () => {
  await withDb(async (db) => {
    await clearSeeded(db, seededIds("photos"));
    await clearSeeded(db, seededIds("done"));
  });
});

test("grading: photo answer with marks", async ({ page }) => {
  const { testId, studentId } = await seedPhotoAnswer();
  // The presigned photo URLs point at no bucket, so a local image stands in.
  await page.route(/e2e-mock-bucket/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: framedPng(1200, 800),
    }),
  );
  await page.goto(`/admin/grading/${testId}?studentId=${studentId}`);
  await expect(page.getByText("check this step")).toBeVisible({
    timeout: 60_000,
  });
  await snap(page, "grading/workspace-photo", { sources: STUDENT_DETAIL });
});

test("grading: tablet layout folds the grade panel into a bottom bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await openVariantRoster(page);
  await expect(
    page.getByTestId("grade-card").getByRole("button", { name: "Feedback" }),
  ).toBeVisible({ timeout: 60_000 });
  await snap(page, "grading/workspace-narrow", { sources: STUDENT_DETAIL });
  await page
    .getByTestId("grade-card")
    .getByRole("button", { name: "Feedback" })
    .click();
  await snap(page, "grading/workspace-narrow-expanded", {
    sources: STUDENT_DETAIL,
  });
});

test("grading: finish panel once every hand-in is graded", async ({ page }) => {
  const { testId, studentId, questionId } = await seedGradedHandIn();
  await page.goto(
    `/admin/grading/${testId}?studentId=${studentId}&questionId=${questionId}&done=1`,
  );
  await expect(
    page.getByRole("heading", { name: "Grading done · [grading] Done" }),
  ).toBeVisible({ timeout: 60_000 });
  await snap(page, "grading/workspace-done", {
    sources: [
      ...STUDENT_DETAIL,
      "src/app/admin/(dashboard)/grading/page-body/finish-panel.tsx",
      "src/app/admin/(dashboard)/grading/page-body/finish-panel.ui.tsx",
      "src/app/admin/(dashboard)/grading/page-body/finish-release.tsx",
    ],
  });

  // The release dialog opens from the panel; Release is never pressed.
  await page
    .getByTestId("finish-panel")
    .getByRole("button", { name: "Release…" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Release grades · [grading] Done" }),
  ).toBeVisible();
  await snap(page, "grading/release-dialog", {
    sources: [
      "src/app/admin/(dashboard)/grading/page-body/finish-release.tsx",
      "src/app/admin/(dashboard)/grading/page-body/release-dialog.tsx",
      "src/app/admin/(dashboard)/grading/page-body/release-dialog.ui.tsx",
      "src/components/ui/dialog.tsx",
    ],
  });
});
