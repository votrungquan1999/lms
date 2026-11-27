// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Db } from "mongodb";
import { GradingMode } from "src/lib/grading-mode";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { seedExpiredNeverHandedIn } from "src/tests/seed-expired-attempt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      selection: { mode: GradingMode.Student },
    });
    render(ui);

    // Then this very render lists the student as handed in and graded
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Graded · 1")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: new RegExp(student.name) }),
    ).toBeInTheDocument();
  });
});
