// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { StudentSession } from "src/lib/session";
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
  usePathname: () => "/student/dashboard",
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

import StudentDashboardLayout from "../layout";

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
 * Feature: the student sidebar shows the current school and a switcher
 * As a student who belongs to more than one school
 * I want to see which school I'm working in, and switch to another
 * So that I always know, and can change, where I'm working
 */
describe("Feature: the student sidebar shows the current school and a switcher", () => {
  it("shows the active school's name and a switcher for a two-school student", async () => {
    const alpha = await addTestSchool("Alpha School");
    const beta = await addTestSchool("Beta School");
    const student = await getTestServices(
      alpha.id,
    ).studentService.createStudentDocument({
      authUserId: "auth-kid",
      username: "kid",
      name: "Kid",
      createdBy: "admin-1",
    });
    await getTestServices(beta.id).studentService.addToSchool(student.id);
    signInAs(
      new StudentSession({
        userId: "auth-kid",
        username: "kid",
        studentId: student.id,
        schoolId: beta.id,
      }),
    );

    const ui = await StudentDashboardLayout({ children: <div>Content</div> });
    render(ui);

    expect(screen.getByTestId("school-switcher-trigger")).toHaveTextContent(
      beta.name,
    );
  });
});
