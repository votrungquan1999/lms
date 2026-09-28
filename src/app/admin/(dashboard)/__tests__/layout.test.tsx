// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
