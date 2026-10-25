// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import { AdminSidebar } from "../admin-sidebar";

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

describe("Feature: AdminSidebar join-request queue link", () => {
  it("should render a 'Join Requests' link to /admin/join-requests inside the 'Need actions' group", () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AdminSidebar email="admin@test" />
        </SidebarProvider>
      </TooltipProvider>,
    );

    const link = screen.getByRole("link", { name: /Join Requests/ });
    expect(link.getAttribute("href")).toBe("/admin/join-requests");
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

/**
 * Feature: AdminSidebar renders safely with no active school
 * As the LMS system
 * I want the sidebar to hide the school name and switcher, and keep
 * everything else, when the admin has no active school
 * So that the owner console and the no-school page can render inside the
 * same layout without a school to show
 */
describe("Feature: AdminSidebar renders safely with no active school", () => {
  // Green-from-first: `school`/`schools` default to `null`/`[]`, so the
  // no-school render path IS the scaffold — no meaningful red is possible.
  it("shows no school name or switcher, and keeps nav and owner items intact", () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AdminSidebar email="admin@test" isOwner school={null} schools={[]} />
        </SidebarProvider>
      </TooltipProvider>,
    );

    expect(
      screen.queryByTestId("school-switcher-trigger"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Schools/ })).toBeInTheDocument();
  });
});

/**
 * Feature: AdminSidebar shows a one-school admin's school name
 * As a school admin (teacher) who belongs to exactly one school
 * I want to see my school's name in the sidebar
 * So that I always know which school my next action lands in
 */
describe("Feature: AdminSidebar shows a one-school admin's school name", () => {
  it("shows the school's name and no switcher when the admin has one school", () => {
    const school = { id: "school-1", name: "Acme School" };
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AdminSidebar email="admin@test" school={school} schools={[school]} />
        </SidebarProvider>
      </TooltipProvider>,
    );

    expect(screen.getAllByText("Acme School")).toHaveLength(2);
    expect(
      screen.queryByTestId("school-switcher-trigger"),
    ).not.toBeInTheDocument();
  });
});
