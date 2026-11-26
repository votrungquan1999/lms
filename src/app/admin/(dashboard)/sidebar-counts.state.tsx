"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";

export interface SidebarCounts {
  toGrade: number;
  joinRequests: number;
}

interface SidebarCountsState {
  /** What the badges show. */
  counts: SidebarCounts | null;
  /** The last numbers the layout rendered; a new object means the layout re-rendered. */
  serverCounts: SidebarCounts | null;
}

type SidebarCountsAction =
  | { type: "SERVER_COUNTS"; counts: SidebarCounts | null }
  | { type: "FETCHED"; counts: SidebarCounts };

const SidebarCountsContext = createContext<SidebarCounts | null>(null);

/**
 * Takes the layout's fresh numbers or a fetched answer.
 * @param state - The shown and last-rendered numbers.
 * @param action - Which of the two arrived.
 * @returns The next state.
 */
function sidebarCountsReducer(
  state: SidebarCountsState,
  action: SidebarCountsAction,
): SidebarCountsState {
  switch (action.type) {
    case "SERVER_COUNTS":
      return { counts: action.counts, serverCounts: action.counts };
    case "FETCHED":
      return { ...state, counts: action.counts };
  }
}

/**
 * Reads the numbers behind the sidebar badges.
 * @returns The counts, or null when the layout passed none (a school-less admin) or no provider wraps the sidebar.
 */
export function useSidebarCounts(): SidebarCounts | null {
  return useContext(SidebarCountsContext);
}

/**
 * Shows the layout's numbers, then asks the read-only counts route after every
 * page change, because client navigation does not re-render the layout. Wraps
 * only the sidebar so a new number never remounts the page.
 * @param counts - The layout's numbers, or null when the admin has no school or the count failed.
 * @param hasSchool - Whether the admin has a school to count for; defaults to whether `counts` is set. A failed count keeps refetching on page change.
 * @param children - The sidebar.
 */
export function SidebarCountsProvider({
  counts,
  hasSchool = counts !== null,
  children,
}: {
  counts: SidebarCounts | null;
  hasSchool?: boolean;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(sidebarCountsReducer, {
    counts,
    serverCounts: counts,
  });
  // Adopt fresher numbers from a layout re-render while rendering, not in an effect
  if (counts !== state.serverCounts) {
    dispatch({ type: "SERVER_COUNTS", counts });
  }

  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  const hasCounts = hasSchool;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new `counts` object must abort the request in flight, since the layout's numbers are newer
  useEffect(() => {
    if (!hasCounts || lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    const controller = new AbortController();
    fetch("/api/admin/sidebar-counts", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((fresh: SidebarCounts | null) => {
        // An answer read just before the abort still loses to fresher numbers
        if (fresh && !controller.signal.aborted) {
          dispatch({ type: "FETCHED", counts: fresh });
        }
      })
      // A failed or aborted request keeps the numbers already shown
      .catch(() => undefined);
    // Leaving or a newer layout render aborts the answer so it cannot overwrite fresher numbers
    return () => controller.abort();
  }, [pathname, counts, hasCounts]);

  return (
    <SidebarCountsContext.Provider value={state.counts}>
      {children}
    </SidebarCountsContext.Provider>
  );
}
