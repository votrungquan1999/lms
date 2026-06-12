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

import { composeFromPoolsAction } from "../compose-from-pools-actions";

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("composeFromPoolsAction", () => {
  it("draws the requested count from a pool into the test", async () => {
    const { poolQuestionService, questionService } = getTestServices();
    await poolQuestionService.addPoolQuestion("pool-1", {
      title: "PQ1",
      content: "",
      createdBy: "admin-1",
    });
    await poolQuestionService.addPoolQuestion("pool-1", {
      title: "PQ2",
      content: "",
      createdBy: "admin-1",
    });

    const form = new FormData();
    form.set("testId", "test-1");
    form.set("courseId", "course-1");
    form.set("selections", JSON.stringify([{ poolId: "pool-1", count: 2 }]));

    const result = await composeFromPoolsAction(null, form);

    expect(result.success).toBe(true);
    const questions = await questionService.listQuestions("test-1");
    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.title).sort()).toEqual(["PQ1", "PQ2"]);
  });

  it("rejects a non-admin caller and composes nothing", async () => {
    requireAdminSession.mockRejectedValueOnce(new Error("forbidden"));

    const form = new FormData();
    form.set("testId", "test-1");
    form.set("courseId", "course-1");
    form.set("selections", JSON.stringify([{ poolId: "pool-1", count: 1 }]));

    const result = await composeFromPoolsAction(null, form);

    expect(result.success).toBe(false);
    expect(
      await getTestServices().questionService.listQuestions("test-1"),
    ).toHaveLength(0);
  });
});
