// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import { questionDetailProps } from "src/tests/question-detail-props";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { seedUnmarkedChoiceHandIn } from "src/tests/seed-unmarked-choice";
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

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: the grade panel of a choice answer that never got its automatic mark", () => {
  it("says it is not marked yet and offers the marking button instead of a score", async () => {
    // Given a handed-in choice answer on a normal test with no grade
    const seed = await seedUnmarkedChoiceHandIn(getTestServices());

    // When the teacher opens it in the grade panel
    const ui = await GradingDetailQuestion(
      await questionDetailProps({
        test: seed.test,
        courseId: seed.course.id,
        questionId: seed.question.id,
        student: { id: seed.ann.id, name: "Ann", username: "ann" },
      }),
    );
    render(ui);

    // Then the note and the button show, with no score
    expect(
      screen.getByText(
        "Not marked yet · automatic marking did not run for this answer",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark multiple-choice answers" }),
    ).toBeEnabled();
    expect(
      screen.getByText(
        "Marks every unmarked multiple-choice answer in this test",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Score:/)).not.toBeInTheDocument();
  });
});
