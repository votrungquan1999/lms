// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { SidebarProvider } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import { AdminSidebar } from "../admin-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/grading",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("src/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

function renderSidebar(props: { isOwner?: boolean } = {}) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AdminSidebar email="admin@test" {...props} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe("Feature: AdminSidebar navigation", () => {
  it("lists To grade, Courses, Question bank, Students and Join requests in order, with no Dashboard", () => {
    const { container } = renderSidebar();

    const links = within(
      container.querySelector('[data-sidebar="content"]') as HTMLElement,
    )
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);

    expect(links).toEqual([
      ["To grade", "/admin/grading"],
      ["Courses", "/admin/courses"],
      ["Question bank", "/admin/pools"],
      ["Students", "/admin/students"],
      ["Join requests", "/admin/join-requests"],
    ]);
    expect(screen.queryByText("Need actions")).not.toBeInTheDocument();
  });

  it("shows the Owner section (User roles, then Schools) only to owners", () => {
    const { container } = renderSidebar({ isOwner: true });

    expect(screen.getByText("Owner")).toBeInTheDocument();
    const owner = within(
      container.querySelector('[data-sidebar="content"]') as HTMLElement,
    )
      .getAllByRole("link")
      .slice(-2)
      .map((link) => link.getAttribute("href"));
    expect(owner).toEqual(["/admin/user-roles", "/admin/schools"]);
  });

  it("hides the Owner section from a teacher who is not an owner", () => {
    renderSidebar();

    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Schools/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /User roles/ })).toBeNull();
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
    expect(screen.getByRole("link", { name: /To grade/ })).toBeInTheDocument();
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
