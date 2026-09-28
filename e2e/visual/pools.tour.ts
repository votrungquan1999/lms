import { expect, type Locator, type Page, test } from "@playwright/test";
import { MongoClient } from "mongodb";
import { prepareVisualPage, snap } from "./snap";

const LIST_SOURCES = [
  "src/app/admin/(dashboard)/pools/page.tsx",
  "src/app/admin/(dashboard)/pools/create-pool-form.tsx",
];
const DETAIL_SOURCES = [
  "src/app/admin/(dashboard)/pools/[poolId]/page.tsx",
  "src/app/admin/(dashboard)/pools/[poolId]/add-pool-question-form.tsx",
  "src/app/admin/(dashboard)/pools/[poolId]/pool-question-edit.state.tsx",
  "src/app/admin/(dashboard)/@breadcrumb/pools/[poolId]/page.tsx",
];
const FORM_SOURCES = [
  "src/app/admin/(dashboard)/pools/[poolId]/add-pool-question-form.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/question-media-picker.ui.tsx",
  "src/app/admin/(dashboard)/pools/pool-question-actions.ts",
];
const COMPOSE_SOURCES = [
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/compose-from-pools-form.tsx",
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/page.tsx",
];

/** Marker on every row this tour creates, so cleanup can never touch seeded data. */
const NS = "[pools] ";
const POOL_MAIN = `${NS}Data Structures Drill`;
const POOL_LONG = `${NS}Nhập môn Cấu trúc dữ liệu và Giải thuật nâng cao cho sinh viên năm hai`;
const POOL_UNBROKEN = `${NS}nguyenthiphuongthao.khoahoccoban2026@student.university.edu.vn`;
const COURSE_TITLE = `${NS}Compose Sandbox`;
const TEST_TITLE = `${NS}Draw From Pool`;

const MONGODB_URI = `mongodb://localhost:27017/${
  process.env.E2E_DB_NAME ?? "lms_visual"
}`;
/** Matches only rows this tour created. */
const NS_FILTER = { $regex: "^\\[pools\\] " };

type QuestionType = "free_text" | "single_select" | "multi_select";

const TYPE_BUTTON: Record<QuestionType, string> = {
  free_text: "Free Text",
  single_select: "Single Select",
  multi_select: "Multi Select",
};

/**
 * Runs `fn` against the visual database.
 * @returns whatever `fn` returns
 */
async function withDb<T>(
  fn: (db: import("mongodb").Db) => Promise<T>,
): Promise<T> {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

/**
 * Deletes only the "[pools] "-prefixed rows this tour writes. There is no UI to
 * remove a pool, so without this a second run would never see an empty bank.
 */
async function resetOwnFixtures(): Promise<void> {
  await withDb(async (db) => {
    const pools = await db
      .collection("question_pool")
      .find({ name: NS_FILTER })
      .toArray();
    const poolIds = pools.map((pool) => pool.id as string);
    if (poolIds.length > 0) {
      await db.collection("pool_question").deleteMany({
        poolId: { $in: poolIds },
      });
      await db.collection("question_pool").deleteMany({ id: { $in: poolIds } });
    }

    const courses = await db
      .collection("course")
      .find({ title: NS_FILTER })
      .toArray();
    const courseIds = courses.map((course) => course.id as string);
    if (courseIds.length > 0) {
      const tests = await db
        .collection("test")
        .find({ courseId: { $in: courseIds } })
        .toArray();
      const testIds = tests.map((row) => row.id as string);
      if (testIds.length > 0) {
        await db.collection("question").deleteMany({
          testId: { $in: testIds },
        });
      }
      await db.collection("test").deleteMany({ courseId: { $in: courseIds } });
      await db.collection("course").deleteMany({ id: { $in: courseIds } });
    }
  });
}

/**
 * Resolves the id of a row this tour just created through the UI.
 * @returns the document's `id` field
 */
async function idOf(
  collection: string,
  filter: Record<string, unknown>,
): Promise<string> {
  return withDb(async (db) => {
    const doc = await db.collection(collection).findOne(filter);
    if (!doc)
      throw new Error(`no ${collection} matching ${JSON.stringify(filter)}`);
    return doc.id as string;
  });
}

/** The "Add Question" form; every other form on a pool page is an edit panel. */
function addQuestionForm(page: Page): Locator {
  return page.locator("form").filter({ has: page.locator("#question-title") });
}

interface QuestionSpec {
  type: QuestionType;
  title: string;
  content: string;
  options?: { text: string; correct: boolean }[];
  modelAnswer?: string;
  explanation?: string;
}

/** Fills the add-question form without submitting, so the filled state can be snapped. */
async function fillQuestion(page: Page, spec: QuestionSpec): Promise<void> {
  if (spec.type !== "free_text") {
    await page
      .getByRole("button", { name: TYPE_BUTTON[spec.type], exact: true })
      .click();
  }
  const form = addQuestionForm(page);
  await form.getByLabel("Question Title").fill(spec.title);
  await form.getByLabel("Content (Markdown)").fill(spec.content);

  for (const [index, option] of (spec.options ?? []).entries()) {
    // The form starts with exactly two blank option rows.
    if (index > 1) {
      await form.getByRole("button", { name: "+ Add Option" }).click();
    }
    await form.locator(`#option-text-${index}`).fill(option.text);
    if (option.correct) {
      await form.getByLabel(`Mark option ${index + 1} correct`).check();
    }
  }

  if (spec.modelAnswer) {
    await form.getByLabel("Model Answer").fill(spec.modelAnswer);
  }
  if (spec.explanation) {
    await form.getByLabel("Explanation").fill(spec.explanation);
  }
}

/** Submits the add-question form and waits for the success banner. */
async function submitQuestion(page: Page): Promise<void> {
  await addQuestionForm(page)
    .getByRole("button", { name: "Add Question" })
    .click();
  await expect(page.getByText("Question added to pool")).toBeVisible({
    timeout: 20000,
  });
}

/** Creates a pool through the dialog and lands back on the list. */
async function createPool(
  page: Page,
  name: string,
  description?: string,
): Promise<void> {
  await page.goto("/admin/pools");
  await page.getByRole("button", { name: "Add Pool" }).click();
  await expect(
    page.getByRole("heading", { name: "Create Pool" }),
  ).toBeVisible();
  await page.getByLabel("Pool Name").fill(name);
  if (description) await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Create Pool" }).click();
  await expect(page.getByText("created successfully")).toBeVisible({
    timeout: 20000,
  });
}

// The whole tour builds one pool set step by step; a failure mid-way makes every
// later state meaningless.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetOwnFixtures();
});

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  // Dev-server route compilation alone can eat the default budget.
  test.setTimeout(120_000);
  await prepareVisualPage(page);
});

test("pools: question bank with no pools at all", async ({ page }) => {
  await page.goto("/admin/pools");
  await expect(
    page.getByRole("heading", { name: "Question Bank" }),
  ).toBeVisible();
  await expect(page.getByText("No pools yet.")).toBeVisible();
  await snap(page, "pools/list-empty", { sources: LIST_SOURCES });
});

test("pools: create-pool dialog, blank and after success", async ({ page }) => {
  await page.goto("/admin/pools");
  await page.getByRole("button", { name: "Add Pool" }).click();
  await expect(
    page.getByRole("heading", { name: "Create Pool" }),
  ).toBeVisible();
  await snap(page, "pools/create-dialog-blank", { sources: LIST_SOURCES });

  await page.getByLabel("Pool Name").fill(POOL_MAIN);
  await page
    .getByLabel("Description")
    .fill("Reusable drills on arrays, linked lists and trees.");
  await page.getByRole("button", { name: "Create Pool" }).click();
  await expect(page.getByText("created successfully")).toBeVisible({
    timeout: 20000,
  });
  await snap(page, "pools/create-dialog-success", { sources: LIST_SOURCES });
});

test("pools: list holding a single pool", async ({ page }) => {
  await page.goto("/admin/pools");
  await expect(page.getByText("1 pool", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: POOL_MAIN })).toBeVisible();
  await snap(page, "pools/list-one", { sources: LIST_SOURCES });
});

test("pools: freshly created pool has no questions", async ({ page }) => {
  const poolId = await idOf("question_pool", { name: POOL_MAIN });
  await page.goto(`/admin/pools/${poolId}`);
  await expect(page.getByRole("heading", { name: POOL_MAIN })).toBeVisible();
  await expect(page.getByText("0 questions")).toBeVisible();
  // The blank add form (free text, the default type) is part of this state.
  await expect(
    addQuestionForm(page).getByRole("button", { name: "Add Question" }),
  ).toBeVisible();
  await snap(page, "pools/detail-empty", { sources: DETAIL_SOURCES });
});

test("pools: free-text question filled, then the success banner", async ({
  page,
}) => {
  const poolId = await idOf("question_pool", { name: POOL_MAIN });
  await page.goto(`/admin/pools/${poolId}`);

  await fillQuestion(page, {
    type: "free_text",
    title: `${NS}Q1 — Explain Big-O notation`,
    content:
      "Explain **Big-O** notation in your own words, then give the complexity of binary search.",
    modelAnswer:
      "Big-O describes how the running time grows with the input size. Binary search is O(log n).",
    explanation: "Look for growth-rate reasoning, not a memorised definition.",
  });
  await addQuestionForm(page)
    .getByRole("radio", { name: "Compare side by side" })
    .click();
  await snap(page, "pools/add-free-text-filled", { sources: FORM_SOURCES });

  await submitQuestion(page);
  // The action revalidates the page, so wait for the list to catch up too.
  await expect(page.getByText(/^1 question$/)).toBeVisible({ timeout: 20000 });
  await snap(page, "pools/add-question-success", {
    sources: [
      ...FORM_SOURCES,
      "src/app/admin/(dashboard)/pools/[poolId]/page.tsx",
    ],
  });
});

test("pools: single-select question filled", async ({ page }) => {
  const poolId = await idOf("question_pool", { name: POOL_MAIN });
  await page.goto(`/admin/pools/${poolId}`);

  await fillQuestion(page, {
    type: "single_select",
    title: `${NS}Q2 — Which structure is FIFO?`,
    content: "Pick the structure that removes elements in arrival order.",
    options: [
      { text: "Stack", correct: false },
      { text: "Queue", correct: true },
      { text: "Binary search tree", correct: false },
    ],
    explanation:
      "A queue removes from the head, so the first in is the first out.",
  });
  await snap(page, "pools/add-single-select-filled", { sources: FORM_SOURCES });

  await submitQuestion(page);
});

test("pools: multi-select question filled", async ({ page }) => {
  const poolId = await idOf("question_pool", { name: POOL_MAIN });
  await page.goto(`/admin/pools/${poolId}`);

  await fillQuestion(page, {
    type: "multi_select",
    title: `${NS}Q3 — Which traversals visit the root first?`,
    content: "Select every traversal that visits the root before its subtrees.",
    options: [
      { text: "Pre-order", correct: true },
      { text: "In-order", correct: false },
      { text: "Level-order", correct: true },
    ],
    explanation:
      "Pre-order and level-order both emit the root before any child.",
  });
  await snap(page, "pools/add-multi-select-filled", { sources: FORM_SOURCES });

  await submitQuestion(page);
});

test("pools: pool holding one question of every type", async ({ page }) => {
  const poolId = await idOf("question_pool", { name: POOL_MAIN });
  await page.goto(`/admin/pools/${poolId}`);
  await expect(page.getByText(/^3 questions$/)).toBeVisible();
  await snap(page, "pools/detail-many-questions", { sources: DETAIL_SOURCES });
});

test("pools: add-question submitted with a blank title", async ({ page }) => {
  const poolId = await idOf("question_pool", { name: POOL_MAIN });
  await page.goto(`/admin/pools/${poolId}`);

  // Spaces satisfy the browser's `required` check and fail the server's trim().
  await addQuestionForm(page).getByLabel("Question Title").fill("   ");
  await addQuestionForm(page)
    .getByRole("button", { name: "Add Question" })
    .click();
  await expect(page.getByText("Question title is required")).toBeVisible({
    timeout: 20000,
  });
  await snap(page, "pools/add-question-error", { sources: FORM_SOURCES });
});

test("pools: pool named with a long spaced title", async ({ page }) => {
  await createPool(
    page,
    POOL_LONG,
    "Bộ câu hỏi ôn tập dành cho sinh viên năm hai, dùng lại cho mọi bài kiểm tra giữa kỳ và cuối kỳ.",
  );
  const poolId = await idOf("question_pool", { name: POOL_LONG });
  await page.goto(`/admin/pools/${poolId}`);
  await expect(page.getByRole("heading", { name: POOL_LONG })).toBeVisible();
  await snap(page, "pools/detail-long-name", { sources: DETAIL_SOURCES });

  // One question here so the list page also renders the singular "1 question".
  await fillQuestion(page, {
    type: "free_text",
    title: `${NS}Câu 1 — Độ phức tạp thuật toán`,
    content: "Trình bày độ phức tạp của thuật toán sắp xếp nhanh.",
  });
  await submitQuestion(page);
});

test("pools: pool named with one unbroken string", async ({ page }) => {
  await createPool(page, POOL_UNBROKEN);
  const poolId = await idOf("question_pool", { name: POOL_UNBROKEN });
  await page.goto(`/admin/pools/${poolId}`);
  await expect(
    page.getByRole("heading", { name: POOL_UNBROKEN }),
  ).toBeVisible();
  await snap(page, "pools/detail-unbroken-name", { sources: DETAIL_SOURCES });
});

test("pools: list holding several pools", async ({ page }) => {
  await page.goto("/admin/pools");
  await expect(page.getByText("3 pools", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: POOL_UNBROKEN })).toBeVisible();
  await snap(page, "pools/list-many", { sources: LIST_SOURCES });
});

test("pools: drawing pool questions into a test", async ({ page }) => {
  await page.goto("/admin/courses");
  await page.getByRole("button", { name: "Add Course" }).click();
  await page.getByLabel("Course Title").fill(COURSE_TITLE);
  await page.getByRole("button", { name: "Create Course" }).click();
  await expect(page.getByText("created successfully")).toBeVisible({
    timeout: 20000,
  });
  const courseId = await idOf("course", { title: COURSE_TITLE });

  await page.goto(`/admin/courses/${courseId}`);
  await page.getByRole("button", { name: "Add Test" }).click();
  await page.getByLabel("Test Title").fill(TEST_TITLE);
  await page.getByRole("button", { name: "Create Test" }).click();
  await expect(page.getByText("created successfully")).toBeVisible({
    timeout: 20000,
  });
  const testId = await idOf("test", { courseId, title: TEST_TITLE });

  await page.goto(`/admin/courses/${courseId}/tests/${testId}`);
  const compose = page.getByRole("button", { name: "Add from Pools" });
  await expect(compose).toBeVisible();
  await page.getByLabel(`Select pool ${POOL_MAIN}`).check();
  await page.getByLabel(`Count for pool ${POOL_MAIN}`).fill("2");
  await snap(page, "pools/compose-panel-selected", {
    sources: COMPOSE_SOURCES,
  });

  await compose.click();
  await expect(page.getByText(/Added 2 questions from pools/)).toBeVisible({
    timeout: 20000,
  });
  await snap(page, "pools/compose-success", { sources: COMPOSE_SOURCES });
});
