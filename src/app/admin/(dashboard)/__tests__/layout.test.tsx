// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { AdminSession } from "src/lib/session";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/grading",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));
// layout.tsx's OWN direct `isAdminEmail` call (the sidebar's cosmetic
// "Owner" section) is unrelated to PageGuard's session lookup and still
// goes through auth-singleton — only that one method needs a stub here.
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    isAdminEmail: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock("src/lib/school-sidebar-counts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("src/lib/school-sidebar-counts")>();
  return { getSchoolSidebarCounts: vi.fn(actual.getSchoolSidebarCounts) };
});

import { getSchoolSidebarCounts } from "src/lib/school-sidebar-counts";
import AdminDashboardLayout from "../layout";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

beforeEach(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: the sidebar shows the teacher's current school and a switcher
 * As a school admin (teacher) who belongs to more than one school
 * I want to see which school I'm working in, and switch to another
 * So that I always know, and can change, where my next action will land
 */
describe("Feature: the sidebar shows the teacher's current school and a switcher", () => {
  it("shows the active school's name and a switcher for a signed-in two-school admin", async () => {
    const { schoolService } = getTestServices();
    const alpha = await schoolService.createSchool({
      name: "Alpha School",
      slug: "alpha",
      createdBy: "owner-1",
    });
    // Registered so the layout's grading count can build the school's services
    const beta = await addTestSchool("Beta School");
    // A syntactically valid ObjectId hex string — stampAccessManaged's
    // updateOne needs one, even though no matching `user` document exists.
    const userId = "507f1f77bcf86cd799439011";
    await schoolService.addMembership(alpha.id, userId, "owner-1");
    await schoolService.addMembership(beta.id, userId, "owner-1");
    signInAs(
      new AdminSession({
        userId,
        email: "teacher@example.com",
        school: { id: beta.id, name: beta.name },
      }),
    );

    const ui = await AdminDashboardLayout({
      children: <div>Page content</div>,
      breadcrumb: <div>Breadcrumb</div>,
    });
    render(ui);

    expect(screen.getByTestId("school-switcher-trigger")).toHaveTextContent(
      beta.name,
    );
  });
});

/**
 * Feature: the school is named once, at the top of the sidebar
 * As a school admin
 * I want the current school shown in one place
 * So that I never act on the wrong school
 */
describe("Feature: the admin shell names the active school once", () => {
  it("shows the school name in the sidebar only, not in a top bar or the footer", async () => {
    const school = await addTestSchool("STEM Venture");
    signInAs(
      new AdminSession({
        userId: "507f1f77bcf86cd799439011",
        email: "teacher@example.com",
        school,
      }),
    );

    const ui = await AdminDashboardLayout({
      children: <div>Page content</div>,
      breadcrumb: <div>Breadcrumb</div>,
    });
    render(ui);

    expect(screen.getAllByText("STEM Venture")).toHaveLength(1);
    expect(screen.queryByTestId("school-badge")).not.toBeInTheDocument();
  });
});

/**
 * Feature: the sidebar badges never take a page down
 * As a school admin
 * I want every admin page to open even when the badge numbers cannot be read
 * So that a failed count costs me a badge, not my work
 */
describe("Feature: a failed badge count leaves the page working", () => {
  it("renders the page with no badges when the count throws", async () => {
    const school = await addTestSchool("STEM Venture");
    signInAs(
      new AdminSession({
        userId: "507f1f77bcf86cd799439011",
        email: "teacher@example.com",
        school,
      }),
    );
    vi.mocked(getSchoolSidebarCounts).mockRejectedValueOnce(
      new Error("count timed out"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const ui = await AdminDashboardLayout({
      children: <div>Page content</div>,
      breadcrumb: <div>Breadcrumb</div>,
    });
    render(ui);

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.queryByTestId("to-grade-badge")).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
