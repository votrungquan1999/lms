// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Db } from "mongodb";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { seedExpiredNeverHandedIn } from "src/tests/seed-expired-attempt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailQuestion } from "../grading-detail-question";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

let db: Db;

describe("Feature: the question grading view hands in an attempt whose time ran out", () => {
  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the auto-grade of an expired, never-handed-in attempt on the first render", async () => {
    // Given a student whose timed attempt ran out with a correct saved answer and no hand-in
    const { course, test, student } = await seedExpiredNeverHandedIn(
      getTestServices(),
      db,
    );
    const [question] = await getTestServices().questionService.listQuestions(
      test.id,
    );

    // When the teacher opens the question's grading view
    const ui = await GradingDetailQuestion({
      test,
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      questionId: question.id,
      students: [
        { id: student.id, name: student.name, username: student.username },
      ],
      basePath: `/admin/grading/${test.id}`,
    });
    render(ui);

    // Then this very render shows the score written by the hand-in
    expect(screen.getByText("Score: 100")).toBeInTheDocument();
  });
});
