// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import {
  SidebarCountsProvider,
  useSidebarCounts,
} from "src/app/admin/(dashboard)/sidebar-counts.state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin/a" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

interface Pending {
  resolve: (counts: { toGrade: number; joinRequests: number }) => void;
}

/** Shows the badge numbers the provider currently serves. */
function Badges() {
  const counts = useSidebarCounts();
  return <p>{counts ? `${counts.toGrade}/${counts.joinRequests}` : "none"}</p>;
}

function tree(counts: { toGrade: number; joinRequests: number }) {
  return (
    <SidebarCountsProvider counts={counts}>
      <Badges />
    </SidebarCountsProvider>
  );
}

describe("Feature: sidebar badges never show an answer older than the numbers on screen", () => {
  const pending: Pending[] = [];

  beforeEach(() => {
    nav.pathname = "/admin/a";
    pending.length = 0;
    // Each request stays open until the test answers it, whatever the abort signal says
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            pending.push({
              resolve: (counts) =>
                resolve({ ok: true, json: async () => counts }),
            });
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the answer to a page change when nothing newer arrived", async () => {
    const view = render(tree({ toGrade: 1, joinRequests: 1 }));

    nav.pathname = "/admin/b";
    view.rerender(tree({ toGrade: 1, joinRequests: 1 }));
    await act(async () => pending[0].resolve({ toGrade: 7, joinRequests: 8 }));

    expect(screen.getByText("7/8")).toBeTruthy();
  });

  it("drops an answer that lands after the layout rendered newer numbers", async () => {
    const view = render(tree({ toGrade: 1, joinRequests: 1 }));
    nav.pathname = "/admin/b";
    view.rerender(tree({ toGrade: 1, joinRequests: 1 }));

    // The layout re-renders with fresher numbers while the request is still open
    view.rerender(tree({ toGrade: 3, joinRequests: 4 }));
    await act(async () => pending[0].resolve({ toGrade: 7, joinRequests: 8 }));

    expect(screen.getByText("3/4")).toBeTruthy();
  });

  it("drops the answer of a page the admin already left", async () => {
    const view = render(tree({ toGrade: 1, joinRequests: 1 }));
    nav.pathname = "/admin/b";
    view.rerender(tree({ toGrade: 1, joinRequests: 1 }));
    nav.pathname = "/admin/c";
    view.rerender(tree({ toGrade: 1, joinRequests: 1 }));

    await act(async () => pending[1].resolve({ toGrade: 5, joinRequests: 6 }));
    await act(async () => pending[0].resolve({ toGrade: 7, joinRequests: 8 }));

    expect(screen.getByText("5/6")).toBeTruthy();
  });
});
