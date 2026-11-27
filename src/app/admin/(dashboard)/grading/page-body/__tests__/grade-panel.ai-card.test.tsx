// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import {
  AI_GRADER_ID,
  AI_MODEL_NAME,
  type AiGradeSuggestionDocument,
} from "src/lib/ai-grade-types";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailStudent } from "../grading-detail-student";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireAdminSession: vi
      .fn()
      .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL }),
  })),
}));

const STUDENT_ANSWER = "line a\nline b\nline c";

function suggestion(
  fields: Partial<AiGradeSuggestionDocument> &
    Pick<
      AiGradeSuggestionDocument,
      "id" | "testId" | "questionId" | "studentId" | "gradedAgainstAnswerId"
    >,
): AiGradeSuggestionDocument {
  return {
    score: 70,
    feedback: "feedback",
    model: AI_MODEL_NAME,
    gradedBy: AI_GRADER_ID,
    generatedByAdminId: "admin-1",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    regenerateReason: null,
    appliedAt: null,
    appliedBy: null,
    ...fields,
  };
}

/** A handed-in one-question test whose answer has the AI suggestions the callback seeds. */
async function renderWithSuggestions(
  db: Awaited<ReturnType<typeof setupTestDb>>["db"],
  build: (ids: {
    testId: string;
    questionId: string;
    studentId: string;
    answerId: string;
  }) => AiGradeSuggestionDocument[],
  /** Runs after the suggestions are saved and before the page renders. */
  prepare?: (ids: {
    testId: string;
    questionId: string;
    studentId: string;
  }) => Promise<void>,
) {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const testDoc = await services.testService.createTest(course.id, {
    title: "Test",
    description: "",
    createdBy: "admin",
  });
  const question = await services.questionService.addQuestion(testDoc.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-1",
    username: "stu",
    name: "Stu",
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );
  await services.answerService.submitAnswer({
    testId: testDoc.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: STUDENT_ANSWER },
  });
  await services.testSubmissionService.submitTest(testDoc.id, student.id);
  const [answer] = await services.answerService.getLatestAnswers(
    testDoc.id,
    student.id,
  );
  await db.collection<AiGradeSuggestionDocument>("ai_grade").insertMany(
    build({
      testId: testDoc.id,
      questionId: question.id,
      studentId: student.id,
      answerId: answer?.id ?? "",
    }),
  );

  await prepare?.({
    testId: testDoc.id,
    questionId: question.id,
    studentId: student.id,
  });

  render(
    await GradingDetailStudent({
      screen: await (
        await import("src/lib/grading-screen-read")
      ).readGradingScreen(TEST_SCHOOL_ID, testDoc),
      test: testDoc,
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
      },
      questionId: question.id,
      basePath: "/admin/grading/test-1",
      routeKind: GradingRouteKind.Hub,
    }),
  );
}

describe("Feature: the AI suggestion card in the grade panel", () => {
  let db: Awaited<ReturnType<typeof setupTestDb>>["db"];

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the suggestion's score out of 100, its full feedback, its model and how many lines its fix changes", async () => {
    await renderWithSuggestions(db, (ids) => [
      suggestion({
        id: "s-1",
        ...ids,
        gradedAgainstAnswerId: ids.answerId,
        score: 72,
        feedback: "Good structure.\nThe second line has a typo.",
        solution: "line a\nline B\nline c",
        regenerateReason: "be stricter",
      }),
    ]);

    const card = within(screen.getByTestId("grade-card")).getByTestId(
      "ai-suggestion-panel",
    );
    expect(card).toHaveTextContent("72 / 100");
    expect(card).toHaveTextContent(
      "Good structure. The second line has a typo.",
    );
    expect(card).toHaveTextContent(AI_MODEL_NAME);
    expect(card).toHaveTextContent(
      "Suggested fix: 1 line changed · shown on the left",
    );
    expect(card).toHaveTextContent("Reason: be stricter");
  });

  it("does not say the fix is shown on the left when the suggestion has no fix or an empty one", async () => {
    await renderWithSuggestions(db, (ids) => [
      suggestion({
        id: "s-empty",
        ...ids,
        gradedAgainstAnswerId: ids.answerId,
        solution: "",
      }),
    ]);

    const card = within(screen.getByTestId("grade-card")).getByTestId(
      "ai-suggestion-panel",
    );
    expect(card).not.toHaveTextContent("Suggested fix");
  });

  it("shows each older suggestion's own fix, folded, next to its own Use button", async () => {
    await renderWithSuggestions(db, (ids) => [
      suggestion({
        id: "s-new",
        ...ids,
        gradedAgainstAnswerId: ids.answerId,
        generatedAt: new Date("2026-01-03T00:00:00Z"),
        solution: "newest fix",
      }),
      suggestion({
        id: "s-mid",
        ...ids,
        gradedAgainstAnswerId: ids.answerId,
        generatedAt: new Date("2026-01-02T00:00:00Z"),
        solution: "middle fix",
      }),
      suggestion({
        id: "s-old",
        ...ids,
        gradedAgainstAnswerId: ids.answerId,
        generatedAt: new Date("2026-01-01T00:00:00Z"),
        solution: "oldest fix",
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "View history (2)" }));
    const history = screen.getByTestId("ai-suggestion-history");
    const [middle, oldest] =
      within(history).getAllByTestId("ai-suggestion-row");

    // Given: the older fixes are folded
    expect(history).not.toHaveTextContent("middle fix");
    expect(history).not.toHaveTextContent("oldest fix");

    // When: the teacher opens the oldest suggestion's fix
    fireEvent.click(
      within(oldest as HTMLElement).getByRole("button", {
        name: "Show suggested fix",
      }),
    );

    // Then: that row shows its own fix beside its Use button, and the middle row stays folded
    expect(oldest).toHaveTextContent("oldest fix");
    expect(
      within(oldest as HTMLElement).getByRole("button", { name: /^use/i }),
    ).toBeInTheDocument();
    expect(middle).not.toHaveTextContent("middle fix");
  });

  it("picks the same latest suggestion every render when two were made at the same instant", async () => {
    const sameInstant = new Date("2026-01-01T00:00:00Z");
    await renderWithSuggestions(db, (ids) => [
      suggestion({
        id: "s-a",
        ...ids,
        gradedAgainstAnswerId: ids.answerId,
        generatedAt: sameInstant,
        score: 10,
      }),
      suggestion({
        id: "s-b",
        ...ids,
        gradedAgainstAnswerId: ids.answerId,
        generatedAt: sameInstant,
        score: 90,
      }),
    ]);

    // The higher id is the later one, so it leads and the other sits in the history.
    const card = screen.getByTestId("ai-suggestion-panel");
    expect(within(card).getAllByTestId("ai-suggestion-row")[0]).toHaveAttribute(
      "data-suggestion-id",
      "s-b",
    );
  });

  it("offers Use, which says what it saves, on a suggestion that has not been used", async () => {
    await renderWithSuggestions(db, (ids) => [
      suggestion({ id: "s-1", ...ids, gradedAgainstAnswerId: ids.answerId }),
    ]);

    const row = screen.getByTestId("ai-suggestion-row");
    expect(
      within(row).getByRole("button", {
        name: "Use · saves score, feedback & solution",
      }),
    ).toBeEnabled();
    expect(within(row).queryByTestId("ai-suggestion-applied-badge")).toBeNull();
  });

  it("shows Used on the suggestion whose score, feedback and solution are the saved grade", async () => {
    await renderWithSuggestions(
      db,
      (ids) => [
        suggestion({
          id: "s-1",
          ...ids,
          gradedAgainstAnswerId: ids.answerId,
          score: 64,
          feedback: "ok work",
          solution: "line a\nline B\nline c",
        }),
      ],
      async ({ testId, studentId }) => {
        await getTestServices().aiGradeService.applySuggestion(
          "s-1",
          "admin-1",
          { testId, studentId },
        );
      },
    );

    const row = screen.getByTestId("ai-suggestion-row");
    expect(
      within(row).getByTestId("ai-suggestion-applied-badge"),
    ).toHaveTextContent("Used");
    expect(
      within(screen.getByTestId("grade-card")).getByLabelText(/Score/),
    ).toHaveValue(64);
  });

  it("offers Use again, without Used, once the teacher has changed the grade by hand after using a suggestion", async () => {
    await renderWithSuggestions(
      db,
      (ids) => [
        suggestion({
          id: "s-1",
          ...ids,
          gradedAgainstAnswerId: ids.answerId,
          score: 64,
          feedback: "ok work",
        }),
      ],
      async ({ testId, questionId, studentId }) => {
        const services = getTestServices();
        await services.aiGradeService.applySuggestion("s-1", "admin-1", {
          testId,
          studentId,
        });
        await services.gradeService.gradeQuestion({
          testId,
          questionId,
          studentId,
          score: 90,
          feedback: "ok work",
          gradedBy: "admin-1",
        });
      },
    );

    const row = screen.getByTestId("ai-suggestion-row");
    expect(within(row).queryByTestId("ai-suggestion-applied-badge")).toBeNull();
    expect(
      within(row).getByRole("button", {
        name: "Use · saves score, feedback & solution",
      }),
    ).toBeEnabled();
  });

  it.each([
    { changed: "feedback", feedback: "better work", solution: "fix" },
    { changed: "solution", feedback: "ok work", solution: "another fix" },
  ])(
    "drops Used once the teacher has changed only the $changed by hand after using a suggestion",
    async ({ feedback, solution }) => {
      await renderWithSuggestions(
        db,
        (ids) => [
          suggestion({
            id: "s-1",
            ...ids,
            gradedAgainstAnswerId: ids.answerId,
            score: 64,
            feedback: "ok work",
            solution: "fix",
          }),
        ],
        async ({ testId, questionId, studentId }) => {
          const services = getTestServices();
          await services.aiGradeService.applySuggestion("s-1", "admin-1", {
            testId,
            studentId,
          });
          await services.gradeService.gradeQuestion({
            testId,
            questionId,
            studentId,
            score: 64,
            feedback,
            solution,
            gradedBy: "admin-1",
          });
        },
      );

      const row = screen.getByTestId("ai-suggestion-row");
      expect(
        within(row).queryByTestId("ai-suggestion-applied-badge"),
      ).toBeNull();
    },
  );

  it("shows Used on a suggestion with no fix once it is used, though the saved grade has no solution either", async () => {
    await renderWithSuggestions(
      db,
      (ids) => [
        suggestion({
          id: "s-1",
          ...ids,
          gradedAgainstAnswerId: ids.answerId,
          score: 64,
          feedback: "ok work",
        }),
      ],
      async ({ testId, studentId }) => {
        await getTestServices().aiGradeService.applySuggestion(
          "s-1",
          "admin-1",
          { testId, studentId },
        );
      },
    );

    expect(
      within(screen.getByTestId("ai-suggestion-row")).getByTestId(
        "ai-suggestion-applied-badge",
      ),
    ).toHaveTextContent("Used");
  });
  it("asks Replace your grade? before using a suggestion over the teacher's own grade, changing nothing on Cancel and saving the suggestion on Replace", async () => {
    let ids: { testId: string; questionId: string; studentId: string };
    await renderWithSuggestions(
      db,
      (built) => [
        suggestion({
          id: "s-1",
          ...built,
          gradedAgainstAnswerId: built.answerId,
          score: 64,
          feedback: "ok work",
        }),
      ],
      async (built) => {
        ids = built;
        await getTestServices().gradeService.gradeQuestion({
          ...built,
          score: 90,
          feedback: "my own words",
          gradedBy: "admin-1",
        });
      },
    );
    const savedScore = async () =>
      (
        await getTestServices().gradeService.getGrade(
          ids.testId,
          ids.questionId,
          ids.studentId,
        )
      )?.score;
    const use = () =>
      within(screen.getByTestId("ai-suggestion-row")).getByRole("button", {
        name: "Use · saves score, feedback & solution",
      });

    // When: Use is clicked over the teacher's own grade, then cancelled.
    fireEvent.click(use());
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Replace your grade?")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    // Then: the grade is untouched.
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await savedScore()).toBe(90);

    // When: Use is confirmed with Replace.
    fireEvent.click(use());
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Replace",
      }),
    );

    // Then: the suggestion's score is the saved grade.
    await waitFor(async () => expect(await savedScore()).toBe(64));
  });

  it("uses a suggestion at once, with no question, when the saved grade came from another suggestion and was saved again unchanged", async () => {
    let ids: { testId: string; questionId: string; studentId: string };
    await renderWithSuggestions(
      db,
      (built) => [
        suggestion({
          id: "s-2",
          ...built,
          gradedAgainstAnswerId: built.answerId,
          score: 80,
          feedback: "newer",
          generatedAt: new Date("2026-01-02T00:00:00Z"),
        }),
        suggestion({
          id: "s-1",
          ...built,
          gradedAgainstAnswerId: built.answerId,
          score: 64,
          feedback: "ok work",
        }),
      ],
      async (built) => {
        ids = built;
        await getTestServices().aiGradeService.applySuggestion(
          "s-1",
          "admin-1",
          { testId: built.testId, studentId: built.studentId },
        );
        // A later save with the same content leaves the grade s-1's, though it is newer than the use.
        await getTestServices().gradeService.gradeQuestion({
          testId: built.testId,
          questionId: built.questionId,
          studentId: built.studentId,
          score: 64,
          feedback: "ok work",
          gradedBy: "admin-1",
        });
      },
    );

    // The newest suggestion (s-2) is the first row.
    const [newest] = screen.getAllByTestId("ai-suggestion-row");
    fireEvent.click(
      within(newest as HTMLElement).getByRole("button", {
        name: "Use · saves score, feedback & solution",
      }),
    );

    await waitFor(async () =>
      expect(
        (
          await getTestServices().gradeService.getGrade(
            ids.testId,
            ids.questionId,
            ids.studentId,
          )
        )?.score,
      ).toBe(80),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
