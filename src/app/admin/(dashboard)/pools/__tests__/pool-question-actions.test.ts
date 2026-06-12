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

import { addPoolQuestionAction } from "../pool-question-actions";

beforeEach(async () => {
  await setupTestDb();
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
