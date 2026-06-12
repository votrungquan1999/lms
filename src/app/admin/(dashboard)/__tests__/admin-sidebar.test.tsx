// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AdminSidebar } from "../admin-sidebar";

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
  usePathname: () => "/admin/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("src/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

describe("Feature: AdminSidebar Need actions group", () => {
  it("should render a 'Grading' link to /admin/grading inside a 'Need actions' group", () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AdminSidebar email="admin@test" />
        </SidebarProvider>
      </TooltipProvider>,
    );

    expect(screen.getByText("Need actions")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Grading/ });
    expect(link.getAttribute("href")).toBe("/admin/grading");
  });
});

describe("Feature: AdminSidebar Question Bank link", () => {
  // Green-from-first: adding the nav entry IS the implementation; no meaningful
  // red is possible (per the project TDD rule).
  it("should render a 'Question Bank' link to /admin/pools", () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AdminSidebar email="admin@test" />
        </SidebarProvider>
      </TooltipProvider>,
    );

    const link = screen.getByRole("link", { name: /Question Bank/ });
    expect(link.getAttribute("href")).toBe("/admin/pools");
  });
});
