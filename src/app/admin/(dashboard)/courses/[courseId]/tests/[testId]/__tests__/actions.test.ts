import type { Db } from "mongodb";
import {
  type FreeTextQuestion,
  MediaContentType,
  type QuestionDocument,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addQuestionAction,
  deleteQuestionAction,
  updateQuestionAction,
} from "../actions";
import { requestUploadSlotsAction } from "../question-media-actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

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

/** Builds the FormData the add-question form submits, with media as a JSON field. */
function buildFreeTextFormData(testId: string, media?: unknown): FormData {
  const formData = new FormData();
  formData.set("type", "free_text");
  formData.set("testId", testId);
  formData.set("courseId", "course-1");
  formData.set("title", "Question with media");
  formData.set("content", "See the attached files.");
  if (media !== undefined) {
    formData.set("media", JSON.stringify(media));
  }
  return formData;
}

describe("Feature: teacher attaches media to a question", () => {
  describe("requesting upload slots", () => {
    it("returns presigned PUT URLs for up to 3 files, in request order", async () => {
      // When the teacher requests slots for two files
      const result = await requestUploadSlotsAction([
        { fileName: "a.png", contentType: MediaContentType.PNG, size: 1000 },
        { fileName: "b.mp4", contentType: MediaContentType.MP4, size: 2000 },
      ]);

      // Then a slot with a presigned URL + key is returned for each, in order
      expect(result.success).toBe(true);
      expect(result.slots).toHaveLength(2);
      expect(result.slots?.[0]).toMatchObject({
        url: expect.stringContaining("https://fake-s3.local/put/"),
        contentType: MediaContentType.PNG,
        order: 0,
      });
      expect(result.slots?.[1]).toMatchObject({
        contentType: MediaContentType.MP4,
        order: 1,
      });
      expect(result.slots?.[0].key).not.toBe(result.slots?.[1].key);
    });
  });

  describe("creating a question with media", () => {
    it("persists the submitted media against the question, in the teacher's order", async () => {
      // When the teacher creates a question with two ordered media entries
      const result = await addQuestionAction(
        null,
        buildFreeTextFormData("test-1", [
          {
            key: "media/questions/first.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 1000,
            fileName: "first.png",
          },
          {
            key: "media/questions/second.mp4",
            contentType: MediaContentType.MP4,
            order: 1,
            size: 2000,
            fileName: "second.mp4",
          },
        ]),
      );

      // Then the question is created and carries its media in order (keys preserved)
      expect(result.success).toBe(true);
      const [question] =
        await getTestServices().questionService.listQuestions("test-1");
      expect(question.media.map((m) => m.key)).toEqual([
        "media/questions/first.png",
        "media/questions/second.mp4",
      ]);
      expect(question.media.map((m) => m.order)).toEqual([0, 1]);
    });

    it("refuses more than 3 media, a disallowed type, or an oversize file, and persists nothing", async () => {
      const tooMany = [0, 1, 2, 3].map((i) => ({
        key: `media/questions/x${i}.png`,
        contentType: MediaContentType.PNG,
        order: i,
        size: 1000,
        fileName: `x${i}.png`,
      }));
      const badType = [
        {
          key: "media/questions/bad.gif",
          contentType: "image/gif",
          order: 0,
          size: 1000,
          fileName: "bad.gif",
        },
      ];
      const oversize = [
        {
          key: "media/questions/big.mp4",
          contentType: MediaContentType.MP4,
          order: 0,
          size: 10 * 1024 * 1024 + 1,
          fileName: "big.mp4",
        },
      ];

      const results = await Promise.all([
        addQuestionAction(null, buildFreeTextFormData("test-1", tooMany)),
        addQuestionAction(null, buildFreeTextFormData("test-1", badType)),
        addQuestionAction(null, buildFreeTextFormData("test-1", oversize)),
      ]);

      for (const result of results) {
        expect(result.success).toBe(false);
      }
      const questions =
        await getTestServices().questionService.listQuestions("test-1");
      expect(questions).toHaveLength(0);
    });
  });

  describe("creating a single_select question with an explanation", () => {
    it("persists the submitted explanation on the created question", async () => {
      const formData = new FormData();
      formData.set("type", "single_select");
      formData.set("testId", "test-1");
      formData.set("courseId", "course-1");
      formData.set("title", "What is 2 + 2?");
      formData.set("content", "Choose the correct answer.");
      formData.set(
        "options",
        JSON.stringify([
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
        ]),
      );
      formData.set("explanation", "4 is the sum of 2 and 2.");

      const result = await addQuestionAction(null, formData);

      expect(result.success).toBe(true);
      const [question] =
        await getTestServices().questionService.listQuestions("test-1");
      expect(question.type).toBe("single_select");
      expect((question as SingleSelectQuestion).explanation).toBe(
        "4 is the sum of 2 and 2.",
      );
    });

    it("normalizes a whitespace-only explanation to absent rather than persisting the whitespace", async () => {
      const formData = new FormData();
      formData.set("type", "single_select");
      formData.set("testId", "test-1");
      formData.set("courseId", "course-1");
      formData.set("title", "What is 2 + 2?");
      formData.set("content", "Choose the correct answer.");
      formData.set(
        "options",
        JSON.stringify([
          { text: "3", isCorrect: false },
          { text: "4", isCorrect: true },
        ]),
      );
      formData.set("explanation", "   ");

      const result = await addQuestionAction(null, formData);

      expect(result.success).toBe(true);
      const [question] =
        await getTestServices().questionService.listQuestions("test-1");
      expect((question as SingleSelectQuestion).explanation).toBeUndefined();
    });
  });

  describe("creating a free_text question with a referenceAnswer and explanation", () => {
    it("persists both fields on the created question", async () => {
      const formData = new FormData();
      formData.set("type", "free_text");
      formData.set("testId", "test-1");
      formData.set("courseId", "course-1");
      formData.set("title", "Explain photosynthesis.");
      formData.set("content", "Write a short paragraph.");
      formData.set(
        "referenceAnswer",
        "Plants convert light into chemical energy.",
      );
      formData.set("explanation", "Focus on the role of chlorophyll.");

      const result = await addQuestionAction(null, formData);

      expect(result.success).toBe(true);
      const [question] =
        await getTestServices().questionService.listQuestions("test-1");
      expect((question as FreeTextQuestion).referenceAnswer).toBe(
        "Plants convert light into chemical energy.",
      );
      expect((question as FreeTextQuestion).explanation).toBe(
        "Focus on the role of chlorophyll.",
      );
    });
  });

  describe("authorization", () => {
    it("refuses a non-admin caller and persists nothing", async () => {
      requireAdminSession.mockRejectedValue(new Error("not admin"));

      const slotResult = await requestUploadSlotsAction([
        { fileName: "a.png", contentType: MediaContentType.PNG, size: 1000 },
      ]);
      const createResult = await addQuestionAction(
        null,
        buildFreeTextFormData("test-1", [
          {
            key: "media/questions/first.png",
            contentType: MediaContentType.PNG,
            order: 0,
            size: 1000,
            fileName: "first.png",
          },
        ]),
      );

      expect(slotResult.success).toBe(false);
      expect(slotResult.message).toContain("Unauthorized");
      expect(createResult.success).toBe(false);
      const questions =
        await getTestServices().questionService.listQuestions("test-1");
      expect(questions).toHaveLength(0);
    });
  });
});

/** Builds the FormData the question-edit panel submits. */
function buildEditFormData(
  questionId: string,
  answerRevealMode: "inherit" | "diff" | "plain",
): FormData {
  const formData = new FormData();
  formData.set("questionId", questionId);
  formData.set("testId", "test-1");
  formData.set("courseId", "course-1");
  formData.set("answerRevealMode", answerRevealMode);
  return formData;
}

describe("Feature: a teacher corrects how a question shows its answer (Step 19)", () => {
  it("persists a switched answer-reveal override", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );

    const result = await updateQuestionAction(
      null,
      buildEditFormData(question.id, "plain"),
    );

    expect(result.success).toBe(true);
    const [updated] = (await getTestServices().questionService.listQuestions(
      "test-1",
    )) as FreeTextQuestion[];
    expect(updated.answerRevealMode).toBe("plain");
  });

  it("clears a set override back to inheriting the test's default", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        answerRevealMode: "diff",
      },
    );

    const result = await updateQuestionAction(
      null,
      buildEditFormData(question.id, "inherit"),
    );

    expect(result.success).toBe(true);
    const [updated] = (await getTestServices().questionService.listQuestions(
      "test-1",
    )) as FreeTextQuestion[];
    expect(updated.answerRevealMode).toBeUndefined();
  });

  it("refuses a non-admin caller and persists nothing", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );
    requireAdminSession.mockRejectedValue(new Error("not admin"));

    const result = await updateQuestionAction(
      null,
      buildEditFormData(question.id, "plain"),
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unauthorized");
    const [unchanged] = (await getTestServices().questionService.listQuestions(
      "test-1",
    )) as FreeTextQuestion[];
    expect(unchanged.answerRevealMode).toBeUndefined();
  });
});

/** Builds the FormData the question-edit panel submits for a title/content correction. */
function buildTitleContentEditFormData(
  questionId: string,
  title: string,
  content: string,
): FormData {
  const formData = new FormData();
  formData.set("questionId", questionId);
  formData.set("testId", "test-1");
  formData.set("courseId", "course-1");
  formData.set("title", title);
  formData.set("content", content);
  return formData;
}

describe("Feature: a teacher fixes a question's title and body (Step 26)", () => {
  it("persists a corrected title and content", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );

    const result = await updateQuestionAction(
      null,
      buildTitleContentEditFormData(
        question.id,
        "Explain gravity (revised)",
        "Write two sentences.",
      ),
    );

    expect(result.success).toBe(true);
    const [updated] =
      await getTestServices().questionService.listQuestions("test-1");
    expect(updated.title).toBe("Explain gravity (revised)");
    expect(updated.content).toBe("Write two sentences.");
  });

  it("rejects a blank title and persists nothing", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );

    const result = await updateQuestionAction(
      null,
      buildTitleContentEditFormData(question.id, "   ", "Write two sentences."),
    );

    expect(result.success).toBe(false);
    const [unchanged] =
      await getTestServices().questionService.listQuestions("test-1");
    expect(unchanged.title).toBe("Explain gravity");
    expect(unchanged.content).toBe("In your own words.");
  });
});

/** Builds the FormData the question-edit panel submits for an options rewrite. */
function buildOptionsEditFormData(
  questionId: string,
  options: { id?: string; text: string; isCorrect: boolean }[],
): FormData {
  const formData = new FormData();
  formData.set("questionId", questionId);
  formData.set("testId", "test-1");
  formData.set("courseId", "course-1");
  formData.set("options", JSON.stringify(options));
  return formData;
}

describe("Feature: a teacher rewrites a question's answer options (Step 27)", () => {
  it("persists a rewritten option list, preserving the kept option's id", async () => {
    const question = (await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      },
    )) as SingleSelectQuestion;
    const parisId = question.options.find((o) => o.text === "Paris")?.id;

    const result = await updateQuestionAction(
      null,
      buildOptionsEditFormData(question.id, [
        { id: parisId, text: "Paris (capital of France)", isCorrect: true },
        { text: "Berlin", isCorrect: false },
      ]),
    );

    expect(result.success).toBe(true);
    const [updated] = (await getTestServices().questionService.listQuestions(
      "test-1",
    )) as SingleSelectQuestion[];
    expect(updated.options.find((o) => o.id === parisId)?.text).toBe(
      "Paris (capital of France)",
    );
    expect(updated.options.map((o) => o.text)).toContain("Berlin");
  });

  it("rejects an options edit that fails the MC rule and persists nothing", async () => {
    const question = (await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      },
    )) as SingleSelectQuestion;

    const result = await updateQuestionAction(
      null,
      buildOptionsEditFormData(question.id, [
        { text: "Paris", isCorrect: false },
        { text: "London", isCorrect: false },
      ]),
    );

    expect(result.success).toBe(false);
    const [unchanged] = (await getTestServices().questionService.listQuestions(
      "test-1",
    )) as SingleSelectQuestion[];
    expect(unchanged.options.find((o) => o.text === "Paris")?.isCorrect).toBe(
      true,
    );
  });
});

/** Builds the FormData the question-edit panel submits for a type switch. */
function buildTypeEditFormData(
  questionId: string,
  type: string,
  options?: { id?: string; text: string; isCorrect: boolean }[],
): FormData {
  const formData = new FormData();
  formData.set("questionId", questionId);
  formData.set("testId", "test-1");
  formData.set("courseId", "course-1");
  formData.set("type", type);
  if (options !== undefined) {
    formData.set("options", JSON.stringify(options));
  }
  return formData;
}

describe("Feature: a teacher changes a question's type (Step 28)", () => {
  it("switches a free_text question into single_select, persisting the new options", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
        referenceAnswer: "Objects with mass attract each other.",
      },
    );

    const result = await updateQuestionAction(
      null,
      buildTypeEditFormData(question.id, "single_select", [
        { text: "Force", isCorrect: true },
        { text: "Energy", isCorrect: false },
      ]),
    );

    expect(result.success).toBe(true);
    const [updated] = (await getTestServices().questionService.listQuestions(
      "test-1",
    )) as SingleSelectQuestion[];
    expect(updated.type).toBe("single_select");
    expect(updated.options.map((o) => o.text)).toEqual(["Force", "Energy"]);
  });

  it("rejects switching into single_select with no options and persists nothing", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );

    const result = await updateQuestionAction(
      null,
      buildTypeEditFormData(question.id, "single_select"),
    );

    expect(result.success).toBe(false);
    const [unchanged] =
      await getTestServices().questionService.listQuestions("test-1");
    expect(unchanged.type).toBe("free_text");
  });

  it("stores no options when switching into free_text, even though the FormData still carries an options payload (D54 — the type governs, not the payload)", async () => {
    const question = (await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Pick the capital",
        content: "Choose one.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      },
    )) as SingleSelectQuestion;

    const result = await updateQuestionAction(
      null,
      buildTypeEditFormData(question.id, "free_text", [
        { text: "Paris", isCorrect: true },
        { text: "London", isCorrect: false },
      ]),
    );

    expect(result.success).toBe(true);
    const doc = await db
      .collection<QuestionDocument>("question")
      .findOne({ id: question.id });
    expect(doc?.type).toBe("free_text");
    expect(doc?.options).toBeNull();
  });
});

/** Builds the FormData the delete-question button submits. */
function buildDeleteQuestionFormData(questionId: string): FormData {
  const formData = new FormData();
  formData.set("questionId", questionId);
  formData.set("testId", "test-1");
  formData.set("courseId", "course-1");
  return formData;
}

describe("Feature: a teacher deletes a question from a test (Step 29)", () => {
  it("soft-deletes the question so it no longer appears in the test's question list", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );

    const result = await deleteQuestionAction(
      null,
      buildDeleteQuestionFormData(question.id),
    );

    expect(result.success).toBe(true);
    const remaining =
      await getTestServices().questionService.listQuestions("test-1");
    expect(remaining).toEqual([]);
  });

  it("refuses a non-admin caller and persists nothing", async () => {
    const question = await getTestServices().questionService.addQuestion(
      "test-1",
      {
        title: "Explain gravity",
        content: "In your own words.",
        createdBy: "admin-1",
      },
    );
    requireAdminSession.mockRejectedValue(new Error("not admin"));

    const result = await deleteQuestionAction(
      null,
      buildDeleteQuestionFormData(question.id),
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unauthorized");
    const remaining =
      await getTestServices().questionService.listQuestions("test-1");
    expect(remaining).toHaveLength(1);
  });
});
