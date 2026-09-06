import type { Db } from "mongodb";
import type { PoolQuestionDocument } from "src/lib/pool-question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import {
  addPoolQuestionAction,
  deletePoolQuestionAction,
  updatePoolQuestionAction,
} from "../pool-question-actions";

let db: Db;

beforeEach(async () => {
  const setup = await setupTestDb();
  db = setup.db;
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("addPoolQuestionAction", () => {
  it("adds a free-text question that is then findable in the pool", async () => {
    const form = new FormData();
    form.set("type", "free_text");
    form.set("poolId", "pool-1");
    form.set("title", "Explain closures");
    form.set("content", "In your own words");

    const result = await addPoolQuestionAction(null, form);

    expect(result.success).toBe(true);
    const questions =
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1");
    expect(questions).toHaveLength(1);
    expect(questions[0].title).toBe("Explain closures");
  });

  // Green-from-first: the error-propagation and admin-guard paths are already
  // wired (service throws on invalid MC; action guard rejects non-admins). No
  // meaningful red is possible, per the project TDD rule.

  it("returns a failure (not a throw) when MC options are invalid, storing nothing", async () => {
    const form = new FormData();
    form.set("type", "single_select");
    form.set("poolId", "pool-1");
    form.set("title", "Bad single");
    form.set("content", "");
    form.set(
      "options",
      JSON.stringify([
        { text: "A", isCorrect: false },
        { text: "B", isCorrect: false },
      ]),
    );

    const result = await addPoolQuestionAction(null, form);

    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "single_select question must have exactly one correct option",
    );
    expect(
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1"),
    ).toHaveLength(0);
  });

  it("normalizes a whitespace-only explanation to absent rather than persisting the whitespace", async () => {
    const form = new FormData();
    form.set("type", "single_select");
    form.set("poolId", "pool-1");
    form.set("title", "Capital of France");
    form.set("content", "Pick one");
    form.set(
      "options",
      JSON.stringify([
        { text: "Paris", isCorrect: true },
        { text: "Berlin", isCorrect: false },
      ]),
    );
    form.set("explanation", "   ");

    const result = await addPoolQuestionAction(null, form);

    expect(result.success).toBe(true);
    const [question] =
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1");
    if (question.type !== "single_select") throw new Error("type narrow");
    expect(question.explanation).toBeUndefined();
  });

  it("persists a referenceAnswer and explanation on a free_text pool question", async () => {
    const form = new FormData();
    form.set("type", "free_text");
    form.set("poolId", "pool-1");
    form.set("title", "Explain photosynthesis");
    form.set("content", "Write a short paragraph.");
    form.set("referenceAnswer", "Plants convert light into chemical energy.");
    form.set("explanation", "Focus on the role of chlorophyll.");
    form.set("answerRevealMode", "plain");

    const result = await addPoolQuestionAction(null, form);

    expect(result.success).toBe(true);
    const [question] =
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1");
    if (question.type !== "free_text") throw new Error("type narrow");
    expect(question.referenceAnswer).toBe(
      "Plants convert light into chemical energy.",
    );
    expect(question.explanation).toBe("Focus on the role of chlorophyll.");
    expect(question.answerRevealMode).toBe("plain");
  });

  it("leaves a free_text pool question's answerRevealMode undefined when the field is omitted", async () => {
    const form = new FormData();
    form.set("type", "free_text");
    form.set("poolId", "pool-1");
    form.set("title", "Explain osmosis");
    form.set("content", "Write a short paragraph.");

    const result = await addPoolQuestionAction(null, form);

    expect(result.success).toBe(true);
    const [question] =
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1");
    if (question.type !== "free_text") throw new Error("type narrow");
    expect(question.answerRevealMode).toBeUndefined();
  });

  it("rejects a non-admin caller and stores nothing", async () => {
    requireAdminSession.mockRejectedValueOnce(new Error("forbidden"));

    const form = new FormData();
    form.set("type", "free_text");
    form.set("poolId", "pool-1");
    form.set("title", "Sneaky");

    const result = await addPoolQuestionAction(null, form);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Unauthorized: admin access required");
    expect(
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1"),
    ).toHaveLength(0);
  });
});

/** Builds the FormData a pool question edit panel submits. */
function buildUpdatePoolQuestionFormData(
  poolQuestionId: string,
  fields: Record<string, string>,
): FormData {
  const form = new FormData();
  form.set("poolQuestionId", poolQuestionId);
  form.set("poolId", "pool-1");
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return form;
}

describe("updatePoolQuestionAction (Step 30)", () => {
  it("persists a corrected title and content", async () => {
    const question =
      await getTestServices().poolQuestionService.addPoolQuestion("pool-1", {
        title: "Explain recursion",
        content: "Describe a base case.",
        createdBy: "admin-1",
      });

    const result = await updatePoolQuestionAction(
      null,
      buildUpdatePoolQuestionFormData(question.id, {
        title: "Explain recursion (revised)",
        content: "Two sentences.",
      }),
    );

    expect(result.success).toBe(true);
    const [updated] =
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1");
    expect(updated.title).toBe("Explain recursion (revised)");
    expect(updated.content).toBe("Two sentences.");

    // D51: the production wiring must actually log pool edits — the two
    // service-level logging tests construct their own service WITH a log,
    // which never exercises this action's real singleton wiring.
    const changeLogRow = await db
      .collection("questionChangeLog")
      .findOne({ questionId: question.id });
    expect(changeLogRow).toMatchObject({
      poolId: "pool-1",
      testId: null,
      action: "update",
    });
  });

  it("stores no options when switching a pool question into free_text, even though the FormData still carries an options payload (D54)", async () => {
    const question =
      await getTestServices().poolQuestionService.addPoolQuestion("pool-1", {
        type: "single_select",
        title: "Capital of France",
        content: "Pick one",
        createdBy: "admin-1",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "Berlin", isCorrect: false },
        ],
      });

    const result = await updatePoolQuestionAction(
      null,
      buildUpdatePoolQuestionFormData(question.id, {
        type: "free_text",
        options: JSON.stringify([
          { text: "Paris", isCorrect: true },
          { text: "Berlin", isCorrect: false },
        ]),
      }),
    );

    expect(result.success).toBe(true);
    const doc = await db
      .collection<PoolQuestionDocument>("pool_question")
      .findOne({ id: question.id });
    expect(doc?.type).toBe("free_text");
    expect(doc?.options).toBeNull();
  });

  it("refuses a non-admin caller and persists nothing", async () => {
    const question =
      await getTestServices().poolQuestionService.addPoolQuestion("pool-1", {
        title: "Explain recursion",
        content: "Describe a base case.",
        createdBy: "admin-1",
      });
    requireAdminSession.mockRejectedValueOnce(new Error("forbidden"));

    const result = await updatePoolQuestionAction(
      null,
      buildUpdatePoolQuestionFormData(question.id, {
        title: "Sneaky rewrite",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Unauthorized: admin access required");
    const [unchanged] =
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1");
    expect(unchanged.title).toBe("Explain recursion");
  });
});

describe("deletePoolQuestionAction (Step 30)", () => {
  it("soft-deletes the pool question so it no longer appears in the pool", async () => {
    const question =
      await getTestServices().poolQuestionService.addPoolQuestion("pool-1", {
        title: "Explain recursion",
        content: "Describe a base case.",
        createdBy: "admin-1",
      });

    const form = new FormData();
    form.set("poolQuestionId", question.id);
    form.set("poolId", "pool-1");

    const result = await deletePoolQuestionAction(null, form);

    expect(result.success).toBe(true);
    expect(
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1"),
    ).toHaveLength(0);

    // D51: the production wiring must actually log pool deletes.
    const changeLogRow = await db
      .collection("questionChangeLog")
      .findOne({ questionId: question.id });
    expect(changeLogRow).toMatchObject({
      poolId: "pool-1",
      testId: null,
      action: "delete",
    });
  });

  it("refuses a non-admin caller and persists nothing", async () => {
    const question =
      await getTestServices().poolQuestionService.addPoolQuestion("pool-1", {
        title: "Explain recursion",
        content: "Describe a base case.",
        createdBy: "admin-1",
      });
    requireAdminSession.mockRejectedValueOnce(new Error("forbidden"));

    const form = new FormData();
    form.set("poolQuestionId", question.id);
    form.set("poolId", "pool-1");

    const result = await deletePoolQuestionAction(null, form);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Unauthorized: admin access required");
    expect(
      await getTestServices().poolQuestionService.listPoolQuestions("pool-1"),
    ).toHaveLength(1);
  });
});
