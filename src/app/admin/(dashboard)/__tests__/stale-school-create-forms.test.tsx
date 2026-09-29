// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { AdminSession } from "src/lib/session";
import {
  addTestSchool,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoursesPage from "../courses/page";
import PoolsPage from "../pools/page";
import StudentsPage from "../students/page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

let school: { id: string; name: string };

beforeEach(async () => {
  await setupTestDb();
  // A non-default school, so a page that posted the default school fails.
  school = await addTestSchool("School B");
  signInAs(
    new AdminSession({
      userId: "0000000000000000000000b1",
      email: "school-b-admin@example.com",
      school,
    }),
  );
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** The school id the open create dialog will post to its action. */
function postedSchoolId(): string | null {
  return (
    document.querySelector<HTMLInputElement>('input[name="expectedSchoolId"]')
      ?.value ?? null
  );
}

/**
 * Feature: a create dialog carries the school its page was opened in
 * As a school admin
 * I want each create dialog to post the school its page showed me
 * So that the create action can tell when my active school changed since
 */
describe("Feature: a create dialog carries the school its page was opened in", () => {
  it("the courses page's Add Course dialog posts the page's school", async () => {
    const user = userEvent.setup();
    render(await CoursesPage());

    await user.click(screen.getByRole("button", { name: "Add Course" }));

    expect(postedSchoolId()).toBe(school.id);
  });

  it("the pools page's Add Pool dialog posts the page's school", async () => {
    const user = userEvent.setup();
    render(await PoolsPage());

    await user.click(screen.getByRole("button", { name: "Add Pool" }));

    expect(postedSchoolId()).toBe(school.id);
  });

  it.each([
    ["header", 0],
    ["empty-state", 1],
  ])(
    "the students page's %s Add Student dialog posts the page's school",
    async (_label, index) => {
      const user = userEvent.setup();
      render(await StudentsPage());
      // With no students yet, the page shows the dialog in its header and its empty state.
      const triggers = screen.getAllByRole("button", { name: "Add Student" });
      expect(triggers).toHaveLength(2);

      await user.click(triggers[index]);

      expect(postedSchoolId()).toBe(school.id);
    },
  );
});
