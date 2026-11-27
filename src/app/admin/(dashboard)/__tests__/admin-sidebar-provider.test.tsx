// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { useSidebar } from "src/components/ui/sidebar";
import { ScreenSize } from "src/hooks/use-screen-size";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSidebarProvider } from "../admin-sidebar-provider";

let pathname = "/admin/grading";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("src/hooks/use-screen-size", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/hooks/use-screen-size")>()),
  useScreenSize: () => ScreenSize.Desktop,
}));

function SidebarState() {
  return <span data-testid="state">{useSidebar().state}</span>;
}

describe("Feature: the sidebar's default on a desktop", () => {
  beforeEach(() => {
    pathname = "/admin/grading";
  });

  it.each([
    ["/admin/grading", "expanded"],
    ["/admin/courses", "expanded"],
    ["/admin/grading/test-1", "collapsed"],
    ["/admin/courses/course-1/tests/test-1/grading", "collapsed"],
  ])("on %s the sidebar is %s", (path, expected) => {
    pathname = path;

    render(
      <AdminSidebarProvider>
        <SidebarState />
      </AdminSidebarProvider>,
    );

    expect(screen.getByTestId("state")).toHaveTextContent(expected);
  });
});
