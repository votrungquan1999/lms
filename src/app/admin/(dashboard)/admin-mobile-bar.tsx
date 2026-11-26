"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "src/components/ui/sidebar";

/** The phone's only way to the navigation; from tablet width the sidebar itself is always on screen. */
export function AdminMobileBar() {
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    // Sticky so the menu stays one tap away while a long page scrolls
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b bg-background px-4 md:hidden">
      <button
        type="button"
        aria-expanded={openMobile}
        aria-label="Open menu"
        onClick={() => setOpenMobile(true)}
        className="-ml-2 grid size-10 place-items-center rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <Menu className="size-5" />
      </button>
    </header>
  );
}
