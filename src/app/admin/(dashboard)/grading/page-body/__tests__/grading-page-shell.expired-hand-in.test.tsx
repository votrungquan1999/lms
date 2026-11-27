// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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
import { GradingMode, GradingSort } from "../grading-page-body.type";
import { GradingPageShell } from "../grading-page-shell";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

let db: Db;

describe("Feature: the grading page shell hands in an attempt whose time ran out", () => {
  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("shows the expired attempt as handed in and graded on the first render", async () => {
    // Given a student whose timed attempt ran out with a correct saved answer and no hand-in
    const { course, test, student } = await seedExpiredNeverHandedIn(
      getTestServices(),
      db,
    );

    // When the teacher opens the grading page
    const ui = await GradingPageShell({
      test,
      courseId: course.id,
      schoolId: TEST_SCHOOL_ID,
      basePath: `/admin/grading/${test.id}`,
      selection: { mode: GradingMode.Student, sort: GradingSort.Enrollment },
    });
    render(ui);

    // Then this very render lists the student as handed in with the auto-grade counted
    const cell = within(screen.getByTestId(`roster-cell-${student.id}`));
    expect(cell.getByText("1/1 graded")).toBeInTheDocument();
    expect(cell.getByText("Graded")).toBeInTheDocument();
  });
});
