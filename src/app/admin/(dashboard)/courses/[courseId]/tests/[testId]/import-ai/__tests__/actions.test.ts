import type { Db } from "mongodb";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import type { QuestionChangeLogDocument } from "src/lib/question-change-log-service";
import {
  MediaContentType,
  type MultiSelectQuestion,
  type QuestionDocument,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importAiQuestionsAction, type ReviewedQuestion } from "../actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// `withSpan` calls this on every thrown error inside its callback — only the
// infra-failure REPLACE test below reaches that path in this file.
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

let db: Db;

beforeEach(async () => {
  const setup = await setupTestDb();
  db = setup.db;
  requireAdminSession.mockResolvedValue({
    userId: "admin-1",
    role: "admin",
    school: TEST_SCHOOL,
  });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** Creates a real course + test so the parent check has something to resolve. */
async function createTest(): Promise<{ courseId: string; testId: string }> {
  const { courseService, testService } = getTestServices();
  const course = await courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin-1",
  });
  const test = await testService.createTest(course.id, {
    title: "Test",
    description: "",
    createdBy: "admin-1",
  });
  return { courseId: course.id, testId: test.id };
}

describe("Feature: importing the reviewed AI-extracted list onto the test", () => {
  it("writes the reviewed questions onto the test in the order the teacher reviewed them", async () => {
    const { courseId, testId } = await createTest();
    // A mixed-type reviewed list, in the order the teacher left it after review.
    const reviewed: ParsedQuestion[] = [
      {
        title: "Q1: photosynthesis",
        content: "Explain it in one paragraph.",
        type: "free_text",
      },
      {
        title: "Q2: pick the prime",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "7", isCorrect: true },
        ],
      },
      {
        title: "Q3: pick all primes",
        content: "Choose every prime number.",
        type: "multi_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: true },
          { text: "7", isCorrect: true },
        ],
      },
    ];

    const result = await importAiQuestionsAction(testId, courseId, reviewed);

    expect(result.success).toBe(true);
    const questions =
      await getTestServices().questionService.listQuestions(testId);
    expect(questions.map((q) => q.title)).toEqual([
      "Q1: photosynthesis",
      "Q2: pick the prime",
      "Q3: pick all primes",
    ]);
    expect(questions.map((q) => q.order)).toEqual([1, 2, 3]);
    // Fidelity check: type/options must survive (addQuestion, not importQuestions).
    expect(questions[1].type).toBe("single_select");
    expect(
      (questions[1] as SingleSelectQuestion).options.map((o) => o.text),
    ).toEqual(["4", "7"]);
  });

  it("rejects the whole batch and names the offending question when one cannot be accepted, importing none of them", async () => {
    const { courseId, testId } = await createTest();
    // Question 2 has TWO correct options — a wrong key, not a missing one,
    // so D32's relaxation for AI import does not cover it either.
    const reviewed: ParsedQuestion[] = [
      {
        title: "Q1: photosynthesis",
        content: "Explain it in one paragraph.",
        type: "free_text",
      },
      {
        title: "Q2: broken key",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: true },
          { text: "7", isCorrect: true },
        ],
      },
      {
        title: "Q3: pick all primes",
        content: "Choose every prime number.",
        type: "multi_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: true },
        ],
      },
    ];

    const result = await importAiQuestionsAction(testId, courseId, reviewed);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Question 2");
    expect(result.message).toContain("Q2: broken key");
    // The offender's 0-indexed position — Step 33 routes this onto that
    // question's own card rather than a bare page-level banner.
    expect(result.invalidQuestionIndex).toBe(1);
    const questions =
      await getTestServices().questionService.listQuestions(testId);
    expect(questions).toHaveLength(0);
  });

  it("imports a keyless single_select and a keyless multi_select rather than rejecting the batch (D32)", async () => {
    const { courseId, testId } = await createTest();
    // Q1 (free_text) writes first so a write-time regression — checkMcOptions
    // run without D32's relaxation — shows up as a partial import, not a
    // clean pre-write rejection.
    const reviewed: ParsedQuestion[] = [
      {
        title: "Q1: photosynthesis",
        content: "Explain it in one paragraph.",
        type: "free_text",
      },
      {
        title: "Q2: keyless single-select",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "7", isCorrect: false },
        ],
      },
      {
        title: "Q3: keyless multi-select",
        content: "Choose every prime number.",
        type: "multi_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: false },
        ],
      },
    ];

    const result = await importAiQuestionsAction(testId, courseId, reviewed);

    expect(result.success).toBe(true);
    const questions =
      await getTestServices().questionService.listQuestions(testId);
    expect(questions).toHaveLength(3);
    expect(
      (questions[1] as SingleSelectQuestion).options.every((o) => !o.isCorrect),
    ).toBe(true);
    expect(
      (questions[2] as MultiSelectQuestion).options.every((o) => !o.isCorrect),
    ).toBe(true);
  });

  it("leaves nothing written on a genuinely invalid batch — the all-or-nothing guarantee, asserted directly rather than left incidental", async () => {
    const { courseId, testId } = await createTest();
    // Two correct options on a single_select is a WRONG key, not a missing
    // one — D32's relaxation does not cover it, so this batch is still
    // rejected outright and must leave zero questions behind.
    const failing: ParsedQuestion[] = [
      {
        title: "Q1: broken key",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: true },
          { text: "7", isCorrect: true },
        ],
      },
    ];

    const result = await importAiQuestionsAction(testId, courseId, failing);

    expect(result.success).toBe(false);
    const questions =
      await getTestServices().questionService.listQuestions(testId);
    expect(questions).toHaveLength(0);
  });
});

/** A key shaped like one this school's upload slots mint. */
function schoolKey(hex: string, extension = "png"): string {
  return `media/schools/${TEST_SCHOOL.id}/questions/${hex}.${extension}`;
}

/**
 * One uploaded document picture as the review screen submits it.
 * @param key - The stored S3 key.
 * @param order - Its position among the question's pictures.
 */
function picture(key: string, order = 0) {
  return {
    fileName: "picture.png",
    contentType: MediaContentType.PNG,
    size: 1000,
    key,
    order,
  };
}

describe("Feature: importing the pictures the document had", () => {
  it("saves each question's uploaded pictures with it, for every question type", async () => {
    const { courseId, testId } = await createTest();
    const reviewed: ReviewedQuestion[] = [
      {
        title: "TL1",
        content: "Read the graph.",
        type: "free_text",
        media: [picture(schoolKey("a1"), 0)],
      },
      {
        title: "Câu 14",
        content: "Which part is the receptor?",
        type: "single_select",
        options: [
          { text: "(1)", isCorrect: false },
          { text: "(4)", isCorrect: true },
        ],
        media: [picture(schoolKey("b2"), 0)],
      },
      {
        title: "Sơ cua",
        content: "Pick every dish with separate colonies.",
        type: "multi_select",
        options: [
          { text: "Dish 1", isCorrect: true },
          { text: "Dish 2", isCorrect: false },
        ],
        media: [picture(schoolKey("c3"), 0), picture(schoolKey("d4"), 1)],
      },
    ];

    const result = await importAiQuestionsAction(testId, courseId, reviewed);

    expect(result.success).toBe(true);
    const questions =
      await getTestServices().questionService.listQuestions(testId);
    expect(questions.map((q) => q.media.map((m) => m.key))).toEqual([
      [schoolKey("a1")],
      [schoolKey("b2")],
      [schoolKey("c3"), schoolKey("d4")],
    ]);
  });

  it("stores only the known picture fields, dropping anything else the browser sent", async () => {
    const { courseId, testId } = await createTest();
    const sentByBrowser = { ...picture(schoolKey("a1")), extra: "unexpected" };
    const reviewed: ReviewedQuestion[] = [
      {
        title: "Q1",
        content: "Read the graph.",
        type: "free_text",
        media: [sentByBrowser],
      },
    ];

    await importAiQuestionsAction(testId, courseId, reviewed);

    const stored = await db
      .collection<QuestionDocument>("question")
      .findOne({ testId });
    expect(stored?.media).toEqual([picture(schoolKey("a1"))]);
  });

  it("rejects a question with more pictures than a question can hold, naming it and importing nothing", async () => {
    const reviewed: ReviewedQuestion[] = [
      { title: "Q1", content: "Explain it.", type: "free_text" },
      {
        title: "Q2: four pictures",
        content: "Compare the pictures.",
        type: "free_text",
        media: [0, 1, 2, 3].map((order) =>
          picture(schoolKey(`e${order}`), order),
        ),
      },
    ];

    const result = await importAiQuestionsAction(
      "test-1",
      "course-1",
      reviewed,
    );

    expect(result).toMatchObject({
      success: false,
      invalidQuestionIndex: 1,
      invalidQuestionReason: "A question can have at most 3 media files",
      message:
        'Question 2 ("Q2: four pictures"): A question can have at most 3 media files',
    });
    expect(
      await getTestServices().questionService.listQuestions("test-1"),
    ).toHaveLength(0);
  });
});

describe("Feature: the import takes only pictures this school uploaded", () => {
  it.each([
    [
      "another school's picture",
      picture(
        "media/schools/00000000-0000-4000-8000-00000000000b/questions/a1.png",
      ),
    ],
    ["a student's answer photo", picture("answers/student-1/a1.jpg")],
    ["a key that climbs out of its folder", picture(schoolKey("../a1"))],
    ["a key carrying a query string", picture(`${schoolKey("a1")}?x=1`)],
  ])(
    "rejects %s, naming the question and importing nothing",
    async (_label, media) => {
      const { courseId, testId } = await createTest();
      const reviewed: ReviewedQuestion[] = [
        { title: "Q1", content: "Explain it.", type: "free_text" },
        {
          title: "Q2: bad picture",
          content: "Look at the picture.",
          type: "free_text",
          media: [media],
        },
      ];

      const result = await importAiQuestionsAction(testId, courseId, reviewed);

      expect(result).toMatchObject({
        success: false,
        invalidQuestionIndex: 1,
        invalidQuestionReason: "Invalid media key",
        message: 'Question 2 ("Q2: bad picture"): Invalid media key',
      });
      expect(
        await getTestServices().questionService.listQuestions(testId),
      ).toHaveLength(0);
    },
  );

  it("keeps the test's existing questions when Replace is rejected for a foreign picture", async () => {
    const { courseId, testId } = await createTest();
    const questionService = getTestServices().questionService;
    await questionService.addQuestion(testId, {
      type: "free_text",
      title: "Existing Q1",
      content: "Stays put.",
      createdBy: "admin-1",
    });
    const reviewed: ReviewedQuestion[] = [
      {
        title: "Q1: answer photo",
        content: "Look at the picture.",
        type: "free_text",
        media: [picture("answers/student-1/a1.jpg")],
      },
    ];

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      reviewed,
      "replace",
    );

    expect(result).toMatchObject({
      success: false,
      invalidQuestionIndex: 0,
      invalidQuestionReason: "Invalid media key",
    });
    const questions = await questionService.listQuestions(testId);
    expect(questions.map((q) => q.title)).toEqual(["Existing Q1"]);
  });

  it("rejects a video, since a document only carries pictures", async () => {
    const { courseId, testId } = await createTest();
    const reviewed: ReviewedQuestion[] = [
      {
        title: "Q1: a video",
        content: "Watch it.",
        type: "free_text",
        media: [
          {
            ...picture(schoolKey("a1", "mp4")),
            fileName: "clip.mp4",
            contentType: MediaContentType.MP4,
          },
        ],
      },
    ];

    const result = await importAiQuestionsAction(testId, courseId, reviewed);

    expect(result).toMatchObject({
      success: false,
      invalidQuestionIndex: 0,
      invalidQuestionReason: "Only pictures can be imported",
    });
    expect(
      await getTestServices().questionService.listQuestions(testId),
    ).toHaveLength(0);
  });
});

describe("Feature: a question left with no text once its picture tag is removed", () => {
  it.each([
    [
      "title",
      { title: "", content: "Explain it.", type: "free_text" as const },
      'Question 2 (""): title is empty',
    ],
    [
      "content",
      { title: "Q2: picture only", content: "", type: "free_text" as const },
      'Question 2 ("Q2: picture only"): content is empty',
    ],
    [
      "an option",
      {
        title: "Q2: picture only",
        content: "Which shape is shown?",
        type: "single_select" as const,
        options: [
          { text: "Circle", isCorrect: true },
          { text: "", isCorrect: false },
        ],
      },
      'Question 2 ("Q2: picture only"): option 2 is empty',
    ],
  ])(
    "stops the import and names the question and field when its %s is empty",
    async (_field, offender, message) => {
      // Given a reviewed list whose second question has an emptied text
      const reviewed: ReviewedQuestion[] = [
        { title: "Q1", content: "Explain it.", type: "free_text" },
        offender,
      ];

      // When it is imported
      const result = await importAiQuestionsAction(
        "test-1",
        "course-1",
        reviewed,
      );

      // Then nothing is written and the message names question 2 and the empty field
      expect(result).toMatchObject({
        success: false,
        invalidQuestionIndex: 1,
        message,
      });
      expect(
        await getTestServices().questionService.listQuestions("test-1"),
      ).toHaveLength(0);
    },
  );
});

describe("Feature: a question whose text is only spaces is rejected like an empty one", () => {
  it.each([
    [
      "title",
      { title: "   ", content: "Explain it.", type: "free_text" as const },
      'Question 2 ("   "): title is empty',
    ],
    [
      "content",
      { title: "Q2", content: " \n ", type: "free_text" as const },
      'Question 2 ("Q2"): content is empty',
    ],
    [
      "an option",
      {
        title: "Q2",
        content: "Which shape is shown?",
        type: "single_select" as const,
        options: [
          { text: "Circle", isCorrect: true },
          { text: "   ", isCorrect: false },
        ],
      },
      'Question 2 ("Q2"): option 2 is empty',
    ],
  ])(
    "stops the import and names the question and field when its %s is only spaces",
    async (_field, offender, message) => {
      const reviewed: ReviewedQuestion[] = [
        { title: "Q1", content: "Explain it.", type: "free_text" },
        offender,
      ];

      const result = await importAiQuestionsAction(
        "test-1",
        "course-1",
        reviewed,
      );

      expect(result).toMatchObject({
        success: false,
        invalidQuestionIndex: 1,
        message,
      });
      expect(
        await getTestServices().questionService.listQuestions("test-1"),
      ).toHaveLength(0);
    },
  );
});

describe("Feature: replacing a test's questions deletes the old ones and writes the reviewed ones (Step 34 / D37 REPLACE)", () => {
  it("soft-deletes every existing question and writes the reviewed list in its place", async () => {
    const { courseId, testId } = await createTest();
    const questionService = getTestServices().questionService;
    const oldQ1 = await questionService.addQuestion(testId, {
      type: "free_text",
      title: "Old Q1",
      content: "Old content.",
      createdBy: "admin-1",
    });
    const oldQ2 = await questionService.addQuestion(testId, {
      type: "free_text",
      title: "Old Q2",
      content: "Old content 2.",
      createdBy: "admin-1",
    });

    const reviewed: ParsedQuestion[] = [
      { title: "New Q1", content: "Fresh content.", type: "free_text" },
    ];

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      reviewed,
      "replace",
    );

    expect(result.success).toBe(true);
    const questions = await questionService.listQuestions(testId);
    expect(questions.map((q) => q.title)).toEqual(["New Q1"]);
    expect(questions[0].order).toBe(1);

    // Read the raw docs, not listQuestions — it filters deletedAt out
    // entirely, so it can never distinguish a soft delete from a hard one.
    const questionCollection = db.collection<QuestionDocument>("question");
    for (const old of [oldQ1, oldQ2]) {
      const doc = await questionCollection.findOne({ id: old.id });
      expect(doc?.deletedAt).toBeInstanceOf(Date);
      expect(doc?.deletedBy).toBe("admin-1");
    }

    const deleteLogRows = await db
      .collection<QuestionChangeLogDocument>("questionChangeLog")
      .find({ questionId: { $in: [oldQ1.id, oldQ2.id] }, action: "delete" })
      .toArray();
    expect(deleteLogRows).toHaveLength(2);
  });

  // Green from the first run — no meaningful red possible. Validation runs
  // BEFORE the `withSpan` callback that contains REPLACE's delete loop, so a
  // rejected batch structurally cannot reach it; there is no code path this
  // test could catch mid-implementation the way the test above did.
  it("validates before deleting anything — a rejected REPLACE batch leaves the existing questions untouched", async () => {
    const { courseId, testId } = await createTest();
    const questionService = getTestServices().questionService;
    await questionService.addQuestion(testId, {
      type: "free_text",
      title: "Untouched Q1",
      content: "Stays put.",
      createdBy: "admin-1",
    });

    const failing: ParsedQuestion[] = [
      {
        title: "Q1: broken key",
        content: "Choose the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: true },
          { text: "7", isCorrect: true },
        ],
      },
    ];

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      failing,
      "replace",
    );

    expect(result.success).toBe(false);
    const questions = await questionService.listQuestions(testId);
    expect(questions.map((q) => q.title)).toEqual(["Untouched Q1"]);
  });
});

describe("Feature: an empty reviewed list is never imported", () => {
  it("rejects an empty REPLACE before it deletes anything", async () => {
    const { courseId, testId } = await createTest();
    const questionService = getTestServices().questionService;
    await questionService.addQuestion(testId, {
      type: "free_text",
      title: "Survives an empty replace",
      content: "Stays put.",
      createdBy: "admin-1",
    });

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      [],
      "replace",
    );

    expect(result.success).toBe(false);
    const questions = await questionService.listQuestions(testId);
    expect(questions.map((q) => q.title)).toEqual([
      "Survives an empty replace",
    ]);
  });
});

describe("Feature: a failed REPLACE warns that the test may be partly changed", () => {
  it("names the REPLACE-specific risk, distinct from a generic failure, when an infra fault interrupts the delete-then-insert loop partway through", async () => {
    const { courseId, testId } = await createTest();
    const questionService = getTestServices().questionService;
    const oldQ1 = await questionService.addQuestion(testId, {
      type: "free_text",
      title: "Old Q1",
      content: "Old content.",
      createdBy: "admin-1",
    });
    await questionService.addQuestion(testId, {
      type: "free_text",
      title: "Old Q2",
      content: "Old content 2.",
      createdBy: "admin-1",
    });

    const reviewed: ParsedQuestion[] = [
      { title: "New Q1", content: "Fresh content.", type: "free_text" },
    ];

    // Simulates an infra fault mid-loop: the first delete succeeds for real,
    // the second is a connection drop — leaving oldQ1 gone, oldQ2 intact, and
    // the insert loop never reached. This is REPLACE's "press hardest"
    // scenario: a mix of old and new, not the milder APPEND-only residual.
    const realDelete = questionService.deleteQuestion.bind(questionService);
    vi.spyOn(questionService, "deleteQuestion")
      .mockImplementationOnce(realDelete)
      .mockRejectedValueOnce(new Error("connection reset"));

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      reviewed,
      "replace",
    );

    expect(result.success).toBe(false);
    // Truthful and actionable, not the raw infra error and not APPEND's
    // generic pass-through message.
    expect(result.message).toMatch(
      /mix of (the )?old and new|partly changed|partially changed/i,
    );
    expect(result.message).not.toBe("connection reset");

    // And the scenario the message warns about is real: one old question
    // gone, the other intact, no new question landed.
    const remaining = await questionService.listQuestions(testId);
    expect(remaining.map((q) => q.title)).toEqual(["Old Q2"]);
    const questionCollection = db.collection<QuestionDocument>("question");
    const deletedDoc = await questionCollection.findOne({ id: oldQ1.id });
    expect(deletedDoc?.deletedAt).toBeInstanceOf(Date);
  });

  it("keeps APPEND's generic failure message on the same kind of infra fault — the new wording is REPLACE-only", async () => {
    const { courseId, testId } = await createTest();
    const questionService = getTestServices().questionService;
    const reviewed: ParsedQuestion[] = [
      { title: "New Q1", content: "Fresh content.", type: "free_text" },
    ];

    vi.spyOn(questionService, "addQuestion").mockRejectedValueOnce(
      new Error("connection reset"),
    );

    const result = await importAiQuestionsAction(
      testId,
      courseId,
      reviewed,
      "append",
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("connection reset");
  });
});

describe("Feature: the import confirmation reads the imported count with correct grammar", () => {
  it("reads 'Imported 1 question', not the literal '(s)'", async () => {
    const { courseId, testId } = await createTest();
    const reviewed: ParsedQuestion[] = [
      { title: "Solo question", content: "Just one.", type: "free_text" },
    ];

    const result = await importAiQuestionsAction(testId, courseId, reviewed);

    expect(result.message).toBe("Imported 1 question");
    expect(result.message).not.toContain("question(s)");
  });
});
