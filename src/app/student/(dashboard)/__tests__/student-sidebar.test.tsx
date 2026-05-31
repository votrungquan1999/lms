// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { StudentSidebar } from "../student-sidebar";

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("src/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

describe("Feature: StudentSidebar My Courses group", () => {
  it("should render each enrolled course as a link to its course page", () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <StudentSidebar
            username="ken"
            courses={[{ id: "course-1", title: "Stem T-coding" }]}
          />
        </SidebarProvider>
      </TooltipProvider>,
    );

    expect(screen.getByText("My Courses")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Stem T-coding/ });
    expect(link.getAttribute("href")).toBe("/student/courses/course-1");
  });
});
