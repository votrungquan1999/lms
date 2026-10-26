// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { AdminSession } from "src/lib/session";
import {
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
  usePathname: () => "/admin/dashboard",
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
    const beta = await schoolService.createSchool({
      name: "Beta School",
      slug: "beta",
      createdBy: "owner-1",
    });
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
 * Feature: the top bar names the school the admin is acting on
 * As a school admin
 * I want the current school unmistakable in the page header
 * So that I never act on the wrong school
 */
describe("Feature: the admin top bar names the active school", () => {
  it("shows the active school's name as a badge in the header", async () => {
    signInAs(
      new AdminSession({
        userId: "507f1f77bcf86cd799439011",
        email: "teacher@example.com",
        school: { id: "school-1", name: "STEM Venture" },
      }),
    );

    const ui = await AdminDashboardLayout({
      children: <div>Page content</div>,
      breadcrumb: <div>Breadcrumb</div>,
    });
    render(ui);

    expect(
      within(screen.getByRole("banner")).getByTestId("school-badge"),
    ).toHaveTextContent("STEM Venture");
  });

  it("truncates a very long school name and keeps the full name in the title", async () => {
    const longName =
      "The Extraordinarily Long Named International Academy of Science and Letters";
    signInAs(
      new AdminSession({
        userId: "507f1f77bcf86cd799439011",
        email: "teacher@example.com",
        school: { id: "school-1", name: longName },
      }),
    );

    const ui = await AdminDashboardLayout({
      children: <div>Page content</div>,
      breadcrumb: <div>Breadcrumb</div>,
    });
    render(ui);

    const badge = within(screen.getByRole("banner")).getByTestId(
      "school-badge",
    );
    expect(badge).toHaveAttribute("title", longName);
    expect(within(badge).getByText(longName)).toHaveClass("truncate");
  });

  it("shows no badge when the admin has no active school", async () => {
    signInAs(
      new AdminSession({
        userId: "507f1f77bcf86cd799439011",
        email: "owner@example.com",
        school: null,
      }),
    );

    const ui = await AdminDashboardLayout({
      children: <div>Page content</div>,
      breadcrumb: <div>Breadcrumb</div>,
    });
    render(ui);

    expect(screen.queryByTestId("school-badge")).not.toBeInTheDocument();
  });

  it("shows the school under the admin's email in the sidebar footer", async () => {
    signInAs(
      new AdminSession({
        userId: "507f1f77bcf86cd799439011",
        email: "teacher@example.com",
        school: { id: "school-1", name: "STEM Venture" },
      }),
    );

    const ui = await AdminDashboardLayout({
      children: <div>Page content</div>,
      breadcrumb: <div>Breadcrumb</div>,
    });
    render(ui);

    const footerSchool = screen.getByTestId("sidebar-footer-school");
    expect(footerSchool).toHaveTextContent("STEM Venture");
    const email = screen.getByText("teacher@example.com");
    expect(
      email.compareDocumentPosition(footerSchool) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
