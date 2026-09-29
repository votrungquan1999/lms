import {
  addTestSchool,
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

import { composeFromPoolsAction } from "../courses/[courseId]/tests/[testId]/compose-from-pools-actions";
import { deletePoolAction, renamePoolAction } from "../pools/actions";
import {
  addPoolQuestionAction,
  deletePoolQuestionAction,
  updatePoolQuestionAction,
} from "../pools/pool-question-actions";

interface School {
  id: string;
  name: string;
}

/**
 * Signs in as the admin of a new, NON-default school, so an entry point that
 * forgets to scope its lookup shows the foreign data seeded in the default
 * school and the row fails.
 */
async function signInAsOtherSchoolAdmin(): Promise<School> {
  const school = await addTestSchool("School B");
  requireAdminSession.mockResolvedValue({
    userId: "admin-b",
    role: "admin",
    school,
  });
  return school;
}

/** Creates a pool in the DEFAULT school — a foreign record for these rows. */
async function createForeignPool(): Promise<string> {
  const pool = await getTestServices().questionPoolService.createPool({
    name: "Foreign Pool",
    description: "",
    createdBy: "default-school-admin",
  });
  return pool.id;
}

/** Creates a pool + question in the DEFAULT school. */
async function createForeignPoolQuestion(): Promise<{
  poolId: string;
  poolQuestionId: string;
}> {
  const poolId = await createForeignPool();
  const question = await getTestServices().poolQuestionService.addPoolQuestion(
    poolId,
    {
      type: "free_text",
      title: "Foreign Question",
      content: "c",
      createdBy: "default-school-admin",
    },
  );
  return { poolId, poolQuestionId: question.id };
}

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: a school admin can never see, rename, delete or draw questions
 * from another school's question pools, or change those pools' questions
 * As a school admin working in one school
 * I want a pool or pool-question id from another school (or another pool in
 * my own school) to be refused by every pool write
 * So that another school's pool data can never be changed through mine
 */
describe("Feature: a school admin can never change another school's question pools or their questions", () => {
  it("renamePoolAction refuses a foreign pool and leaves its name unchanged", async () => {
    await signInAsOtherSchoolAdmin();
    const poolId = await createForeignPool();
    const formData = new FormData();
    formData.set("poolId", poolId);
    formData.set("name", "Hacked");

    const result = await renamePoolAction(null, formData);

    expect(result).toEqual({ success: false, message: "Pool not found" });
    const foreign = await getTestServices().questionPoolService.getPool(poolId);
    expect(foreign?.name).toBe("Foreign Pool");
  });

  it("deletePoolAction refuses a foreign pool and leaves it un-deleted", async () => {
    await signInAsOtherSchoolAdmin();
    const poolId = await createForeignPool();
    const formData = new FormData();
    formData.set("poolId", poolId);

    const result = await deletePoolAction(null, formData);

    expect(result).toEqual({ success: false, message: "Pool not found" });
    expect(
      await getTestServices().questionPoolService.getPool(poolId),
    ).not.toBeNull();
  });

  it("addPoolQuestionAction refuses a foreign pool and adds no question", async () => {
    await signInAsOtherSchoolAdmin();
    const poolId = await createForeignPool();
    const formData = new FormData();
    formData.set("type", "free_text");
    formData.set("poolId", poolId);
    formData.set("title", "Q1");
    formData.set("content", "content");

    const result = await addPoolQuestionAction(null, formData);

    expect(result).toEqual({ success: false, message: "Pool not found" });
    expect(
      await getTestServices().poolQuestionService.listPoolQuestions(poolId),
    ).toEqual([]);
  });

  it("updatePoolQuestionAction refuses a foreign-school pool question and leaves it unchanged", async () => {
    const { poolId, poolQuestionId } = await createForeignPoolQuestion();
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("poolQuestionId", poolQuestionId);
    formData.set("poolId", poolId);
    formData.set("title", "Hacked");

    const result = await updatePoolQuestionAction(null, formData);

    expect(result).toEqual({ success: false, message: "Pool not found" });
    const [reloaded] =
      await getTestServices().poolQuestionService.listPoolQuestions(poolId);
    expect(reloaded.title).toBe("Foreign Question");
  });

  it("deletePoolQuestionAction refuses a foreign-school pool question and leaves it in place", async () => {
    const { poolId, poolQuestionId } = await createForeignPoolQuestion();
    await signInAsOtherSchoolAdmin();
    const formData = new FormData();
    formData.set("poolQuestionId", poolQuestionId);
    formData.set("poolId", poolId);

    const result = await deletePoolQuestionAction(null, formData);

    expect(result).toEqual({ success: false, message: "Pool not found" });
    expect(
      await getTestServices().poolQuestionService.listPoolQuestions(poolId),
    ).toHaveLength(1);
  });

  it.each([
    [
      "updatePoolQuestionAction",
      (formData: FormData) => {
        formData.set("title", "Hacked");
        return updatePoolQuestionAction(null, formData);
      },
    ],
    [
      "deletePoolQuestionAction",
      (formData: FormData) => deletePoolQuestionAction(null, formData),
    ],
  ])(
    "%s refuses a pool question id that belongs to a different pool in the SAME school",
    async (_name, act) => {
      const school = await signInAsOtherSchoolAdmin();
      const own = getTestServices(school.id);
      const poolA = await own.questionPoolService.createPool({
        name: "Pool A",
        description: "",
        createdBy: "admin-b",
      });
      const poolB = await own.questionPoolService.createPool({
        name: "Pool B",
        description: "",
        createdBy: "admin-b",
      });
      const questionOnA = await own.poolQuestionService.addPoolQuestion(
        poolA.id,
        {
          type: "free_text",
          title: "On A",
          content: "c",
          createdBy: "admin-b",
        },
      );
      const formData = new FormData();
      formData.set("poolQuestionId", questionOnA.id);
      formData.set("poolId", poolB.id);

      const result = await act(formData);

      expect(result).toEqual({
        success: false,
        message: "Pool question not found",
      });
      const onA = await own.poolQuestionService.listPoolQuestions(poolA.id);
      expect(onA.map((q) => q.title)).toEqual(["On A"]);
    },
  );

  it("composeFromPoolsAction with a foreign pool draws no question, never names that pool, and leaves its questions unchanged", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const test = await own.testService.createTest(course.id, {
      title: "Own Test",
      description: "",
      createdBy: "admin-b",
    });
    const { poolId } = await createForeignPoolQuestion();
    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);
    formData.set("selections", JSON.stringify([{ poolId, count: 1 }]));

    const result = await composeFromPoolsAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.message).not.toContain("Foreign Pool");
    expect(await own.questionService.listQuestions(test.id)).toEqual([]);
    expect(
      await getTestServices().poolQuestionService.listPoolQuestions(poolId),
    ).toHaveLength(1);
  });

  it("renamePoolAction still renames a pool in the admin's own school", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    const pool = await own.questionPoolService.createPool({
      name: "Old name",
      description: "",
      createdBy: "admin-b",
    });
    const formData = new FormData();
    formData.set("poolId", pool.id);
    formData.set("name", "New name");

    const result = await renamePoolAction(null, formData);

    expect(result.success).toBe(true);
    expect((await own.questionPoolService.getPool(pool.id))?.name).toBe(
      "New name",
    );
  });

  it("addPoolQuestionAction still adds a question to a pool in the admin's own school", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    const pool = await own.questionPoolService.createPool({
      name: "Own Pool",
      description: "",
      createdBy: "admin-b",
    });
    const formData = new FormData();
    formData.set("type", "free_text");
    formData.set("poolId", pool.id);
    formData.set("title", "Q1");
    formData.set("content", "content");

    const result = await addPoolQuestionAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      (await own.poolQuestionService.listPoolQuestions(pool.id)).map(
        (q) => q.title,
      ),
    ).toEqual(["Q1"]);
  });
});
