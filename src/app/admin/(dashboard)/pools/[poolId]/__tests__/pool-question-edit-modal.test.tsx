// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Db } from "mongodb";
import { MediaContentType } from "src/lib/question-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getFakeS3,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updatePoolQuestionAction } from "../../pool-question-actions";
import PoolDetailPage from "../page";

let db: Db;

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireAdminSession: vi.fn(async () => ({
      userId: "admin-1",
      school: TEST_SCHOOL,
    })),
  })),
}));

/**
 * Feature: A teacher edits a Question Bank question in an Edit modal
 * As a teacher
 * I want to change a Question Bank question in a modal and see it updated in the preview
 * So that I edit without a long inline form on the page
 */
describe("Feature: Question Bank question Edit modal", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.unstubAllGlobals();
  });

  it("opens an Edit question modal, saves a new title, closes, and the preview shows it", async () => {
    // Given: a Question Bank page with one free-text question
    const user = userEvent.setup();
    const services = getTestServices();
    const pool = await services.questionPoolService.createPool({
      name: "Pool",
      description: "",
      createdBy: "admin-1",
    });
    const question = await services.poolQuestionService.addPoolQuestion(
      pool.id,
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );
    const params = Promise.resolve({ poolId: pool.id });
    const { rerender } = render(await PoolDetailPage({ params }));

    // When: the teacher opens Edit, retitles the question and saves
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog", {
      name: /edit question/i,
    });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Explain universal gravitation");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Then: the modal closes and the new title is stored
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const [updated] = await services.poolQuestionService.listPoolQuestions(
      pool.id,
    );
    expect(updated).toMatchObject({
      id: question.id,
      title: "Explain universal gravitation",
    });

    // And: once the page refreshes (revalidate is mocked) the preview shows it
    rerender(await PoolDetailPage({ params }));
    expect(
      screen.getByText("Question 1: Explain universal gravitation"),
    ).toBeInTheDocument();
  });

  it("removes one picture, adds another and retitles in a single save, and the dropped file leaves storage", async () => {
    // Given: a Question Bank question with two pictures
    const user = userEvent.setup();
    const services = getTestServices();
    const pool = await services.questionPoolService.createPool({
      name: "Pool",
      description: "",
      createdBy: "admin-1",
    });
    const keyA = `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`;
    const keyB = `media/schools/${TEST_SCHOOL_ID}/questions/bbbbbbbb-0000.png`;
    const question = await services.poolQuestionService.addPoolQuestion(
      pool.id,
      {
        title: "Read the chart",
        content: "Describe it.",
        createdBy: "admin-1",
        media: [
          {
            key: keyA,
            contentType: MediaContentType.PNG,
            order: 0,
            size: 111,
            fileName: "a.png",
          },
          {
            key: keyB,
            contentType: MediaContentType.PNG,
            order: 1,
            size: 222,
            fileName: "b.png",
          },
        ],
      },
    );
    const params = Promise.resolve({ poolId: pool.id });
    const { rerender } = render(await PoolDetailPage({ params }));

    // When: the teacher drops the first picture, picks a new file and retitles
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog", {
      name: /edit question/i,
    });
    await user.click(
      within(dialog).getByRole("button", { name: /remove picture 1/i }),
    );
    await user.upload(
      within(dialog).getByLabelText("Media Files"),
      new File(["c"], "c.png", { type: "image/png" }),
    );
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Read the new chart");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Then: the kept picture keeps its stored details, the new one follows it
    const stored = await db
      .collection("pool_question")
      .findOne({ id: question.id });
    expect(stored?.title).toBe("Read the new chart");
    expect(stored?.media).toEqual([
      {
        key: keyB,
        contentType: "image/png",
        order: 0,
        size: 222,
        fileName: "b.png",
      },
      expect.objectContaining({
        contentType: "image/png",
        order: 1,
        size: 1,
        fileName: "c.png",
      }),
    ]);

    // And: the text and picture change landed as one update
    const logRows = await db
      .collection("questionChangeLog")
      .find({ questionId: question.id })
      .toArray();
    expect(logRows).toHaveLength(1);

    // And: the dropped picture's file left storage
    expect(getFakeS3().deletedKeys).toEqual([keyA]);

    // And: the refreshed preview shows both pictures
    rerender(await PoolDetailPage({ params }));
    const card = screen
      .getByText("Question 1: Read the new chart")
      .closest('[data-slot="card"]');
    if (!(card instanceof HTMLElement)) throw new Error("Expected a card");
    expect(
      within(card)
        .getAllByRole("img")
        .map((i) => i.getAttribute("alt")),
    ).toEqual(["Picture 1", "Picture 2"]);
  });

  it("keeps a removed picture's file when a test question composed from the pool still holds it", async () => {
    // Given: a Question Bank question and a test question both holding one picture
    const services = getTestServices();
    const pool = await services.questionPoolService.createPool({
      name: "Pool",
      description: "",
      createdBy: "admin-1",
    });
    const key = `media/schools/${TEST_SCHOOL_ID}/questions/aaaaaaaa-0000.png`;
    const media = [
      {
        key,
        contentType: MediaContentType.PNG,
        order: 0,
        size: 111,
        fileName: "a.png",
      },
    ];
    const poolQuestion = await services.poolQuestionService.addPoolQuestion(
      pool.id,
      { title: "Chart", content: "Describe.", createdBy: "admin-1", media },
    );
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
    });
    await services.questionService.addQuestion(test.id, {
      title: "Chart",
      content: "Describe.",
      createdBy: "admin",
      media,
    });

    // When: the picture is removed from the Question Bank question
    const form = new FormData();
    form.set("poolQuestionId", poolQuestion.id);
    form.set("poolId", pool.id);
    form.set("media", "[]");
    const result = await updatePoolQuestionAction(null, form);

    // Then: the picture left the Question Bank question, but its shared file stays in storage
    expect(result.success).toBe(true);
    const stored = await db
      .collection("pool_question")
      .findOne({ id: poolQuestion.id });
    expect(stored?.media).toEqual([]);
    expect(getFakeS3().deletedKeys).toEqual([]);
  });
});
