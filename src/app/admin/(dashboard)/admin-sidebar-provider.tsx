"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { SidebarProvider } from "src/components/ui/sidebar";
import { ScreenSize, useScreenSize } from "src/hooks/use-screen-size";

// Slightly wider than the stock 3rem so each rail icon gets a 40 px tile
const railStyle = { "--sidebar-width-icon": "3.5rem" } as CSSProperties;

const noSlide =
  "[&_[data-slot=sidebar-container]]:transition-none [&_[data-slot=sidebar-gap]]:transition-none";

/**
 * Opens the sidebar on a desktop and folds it to the icon rail on a tablet.
 * A teacher's own fold or expand holds only for the screen size it was made
 * in, so resizing across a breakpoint returns to that size's default.
 * Only that fold or expand slides; the size default applies at once, so a
 * tablet page load does not slide from the server's full sidebar to the rail.
 * @param children - The sidebar and the page beside it.
 */
export function AdminSidebarProvider({ children }: { children: ReactNode }) {
  const size = useScreenSize();
  const [choice, setChoice] = useState<{ size: ScreenSize; open: boolean }>();
  const ownChoice = choice?.size === size;
  const open = ownChoice ? choice.open : size === ScreenSize.Desktop;

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => setChoice({ size, open: next })}
      style={railStyle}
      className={ownChoice ? undefined : noSlide}
    >
      {children}
    </SidebarProvider>
  );
}
