import { useSyncExternalStore } from "react";

export enum ScreenSize {
  Phone = "phone",
  Tablet = "tablet",
  Desktop = "desktop",
}

const TABLET_MIN_WIDTH = 768;
const DESKTOP_MIN_WIDTH = 1280;

const tabletQuery = `(min-width: ${TABLET_MIN_WIDTH}px)`;
const desktopQuery = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

/**
 * Calls `onChange` whenever the window crosses either breakpoint.
 * @param onChange - React's re-read callback.
 * @returns The unsubscribe function.
 */
function subscribe(onChange: () => void) {
  const queries = [tabletQuery, desktopQuery].map((query) =>
    window.matchMedia(query),
  );
  for (const mql of queries) mql.addEventListener("change", onChange);
  return () => {
    for (const mql of queries) mql.removeEventListener("change", onChange);
  };
}

/**
 * Reads the window's size class now.
 * @returns The size class for the current width.
 */
function getSnapshot(): ScreenSize {
  if (window.matchMedia(desktopQuery).matches) return ScreenSize.Desktop;
  if (window.matchMedia(tabletQuery).matches) return ScreenSize.Tablet;
  return ScreenSize.Phone;
}

/**
 * The size class used on the server and during hydration.
 * @returns Desktop: the server cannot know the width.
 */
function getServerSnapshot(): ScreenSize {
  return ScreenSize.Desktop;
}

/**
 * Tracks the window width as a phone, tablet or desktop size.
 * @returns The size class; desktop on the server and during hydration.
 */
export function useScreenSize(): ScreenSize {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
