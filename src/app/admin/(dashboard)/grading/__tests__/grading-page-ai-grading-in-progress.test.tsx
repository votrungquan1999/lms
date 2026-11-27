// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiClient, AiGradeBatchInput } from "src/lib/ai/ai-client";
import { BackgroundClaudeRunnerClient } from "src/lib/ai/background-claude-runner-client";
import { ready } from "src/lib/ai/runner-settings";
import { AiGradeJobTrigger } from "src/lib/ai-grade-job-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailStudent } from "../page-body/grading-detail-student";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/pending-ai-grading-refresher.ui",
  () => ({
    PendingAiGradingRefresher: () => (
      <span data-testid="pending-ai-grading-refresher" />
    ),
  }),
);
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

const RUNNER_JOB_ID = "0123456789abcdef01234567";

/** Stub that grades every question 80, so a round can be seeded through the service. */
const stubAiClient: AiClient = {
  async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
    return items.map((item) => ({
      questionId: item.questionId,
      score: 80,
      feedback: "Good",
    }));
  },
};

interface SeededSubmission {
  courseId: string;
  testId: string;
  studentId: string;
  questionId: string;
  answerId: string;
}

/** Seeds a submitted student with one written answer, optionally with a finished earlier AI round. */
async function seedSubmission(options: {
  withSuggestions: boolean;
  withPendingJob?: boolean;
  /** The teacher grades every answer by hand, which moves the submission to Graded. */
  handGraded?: boolean;
}): Promise<{
  seed: SeededSubmission;
  renderPage: () => Promise<void>;
  buildPage: () => Promise<React.ReactElement>;
}> {
  const services = getTestServices();
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
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Explain recursion",
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
  const answer = await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "A function that calls itself." },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  if (options.withSuggestions) {
    await services.aiGradeService.generateForStudent(
      test.id,
      student.id,
      "admin-1",
    );
  }
  if (options.withPendingJob ?? true) {
    await services.aiGradeJobService.create({
      courseId: course.id,
      testId: test.id,
      studentId: student.id,
      questionId: null,
      trigger: AiGradeJobTrigger.AutoGrade,
      runnerJobId: RUNNER_JOB_ID,
      candidates: [{ questionId: question.id, answerId: answer.id }],
      reason: null,
      includeGraded: false,
      byAdminId: "admin-1",
    });
  }
  if (options.handGraded) {
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 70,
      feedback: "Mine",
      gradedBy: "admin-1",
    });
  }

  const buildPage = async () =>
    GradingDetailStudent({
      test,
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
      },
      basePath: `/admin/grading/${test.id}`,
    });

  return {
    seed: {
      courseId: course.id,
      testId: test.id,
      studentId: student.id,
      questionId: question.id,
      answerId: answer.id,
    },
    renderPage: async () => {
      render(await buildPage());
    },
    buildPage,
  };
}

describe("Feature: a teacher sees AI grading in progress and cannot start another round", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb({ aiClient: stubAiClient });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the in-progress note and disables Auto-grade while a job is pending", async () => {
    // Given a submitted student whose AI grading job is still pending
    const { seed, renderPage } = await seedSubmission({
      withSuggestions: false,
    });

    // When the teacher opens the grading page
    await renderPage();

    // Then the page says grading is in progress and since when, in the teacher's own time
    const job = await getTestServices().aiGradeJobService.getLatestForStudent(
      seed.testId,
      seed.studentId,
    );
    // inside the grade panel, beside the suggestion card, not in the student header
    expect(
      within(screen.getByTestId("grade-card")).getByTestId(
        "ai-grading-in-progress",
      ),
    ).toHaveTextContent(
      `AI grading in progress since ${job?.createdAt.toLocaleString()}`,
    );

    // And Auto-grade cannot be clicked again
    expect(
      screen.getByRole("button", { name: /auto-grade with ai/i }),
    ).toBeDisabled();
  });

  it("disables Regenerate all and Regenerate this answer while a job is pending over an earlier round", async () => {
    // Given a student with an earlier AI round and a newer job still pending
    const { renderPage } = await seedSubmission({ withSuggestions: true });

    // When the teacher opens the grading page
    await renderPage();

    // Then both regenerate triggers are disabled and the note is shown once
    expect(
      screen.getByRole("button", { name: /regenerate all/i }),
    ).toBeDisabled();
    expect(screen.getByTestId("ai-regenerate-question-trigger")).toBeDisabled();
    expect(screen.getAllByTestId("ai-grading-in-progress")).toHaveLength(1);
  });

  it("still shows the note, the self-refresh and disabled per-question regenerate when the teacher hand-graded everything while the job runs", async () => {
    // Given a fully hand-graded submission, so its status is Graded, with a job still pending
    const { renderPage } = await seedSubmission({
      withSuggestions: true,
      handGraded: true,
    });

    // When the teacher opens the grading page
    await renderPage();

    // Then the page still follows the job: note, self-refresh and a disabled regenerate
    expect(screen.getAllByTestId("ai-grading-in-progress")).toHaveLength(1);
    expect(
      screen.getByTestId("pending-ai-grading-refresher"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ai-regenerate-question-trigger")).toBeDisabled();
  });

  it("keeps the page refreshing only while a job is pending", async () => {
    // Given a submission with a pending job
    const pending = await seedSubmission({ withSuggestions: false });

    // When the teacher opens the grading page
    await pending.renderPage();

    // Then the self-refresh is mounted
    expect(
      screen.getByTestId("pending-ai-grading-refresher"),
    ).toBeInTheDocument();
  });

  it("does not refresh a page with no pending job", async () => {
    // Given a submission that was never sent to the runner
    const idle = await seedSubmission({
      withSuggestions: false,
      withPendingJob: false,
    });

    // When the teacher opens the grading page
    await idle.renderPage();

    // Then nothing refreshes it
    expect(screen.queryByTestId("pending-ai-grading-refresher")).toBeNull();
  });
});

describe("Feature: the teacher's click confirmation does not outlive the job it announced", () => {
  const fakeFetch = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: RUNNER_JOB_ID, status: "queued" }), {
          status: 201,
        }),
    );
    const client = new BackgroundClaudeRunnerClient(
      { url: "https://runner.test", key: "bcr_svc_testkey" },
      { fetch: fakeFetch },
    );
    await setupTestDb({
      aiClient: stubAiClient,
      runnerClientProvider: () => ready(client),
    });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("clears the green 'AI grading started' message once the page shows the in-progress note", async () => {
    // Given a submitted student the teacher has not sent to the runner yet
    const { buildPage } = await seedSubmission({
      withSuggestions: false,
      withPendingJob: false,
    });
    const { rerender } = render(await buildPage());

    // When the teacher clicks Auto-grade and sees the confirmation
    await userEvent.click(
      screen.getByRole("button", { name: /auto-grade with ai/i }),
    );
    expect(await screen.findByText(/AI grading started/)).toBeInTheDocument();

    // And the page re-renders with the job now pending
    rerender(await buildPage());

    // Then the in-progress note stands alone, without the confirmation beside it
    expect(screen.getByTestId("ai-grading-in-progress")).toBeInTheDocument();
    expect(screen.queryByText(/AI grading started/)).toBeNull();
  });
});
