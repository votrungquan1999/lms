"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "src/components/ui/button";
import { cn } from "src/lib/utils";
import { useNavigatorFold } from "./question-navigator.state";

/**
 * The bar itself: pinned to the top of the window while the student scrolls.
 * @param children - The bar's rows (count and timer, then the question boxes).
 */
export function NavigatorBar({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Question navigator"
      className={cn(
        "rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur",
        "sticky top-0 z-10 grid gap-2",
      )}
    >
      {children}
    </nav>
  );
}

/**
 * Top row of the bar: the answered count, and the timer when there is one.
 * @param children - The row's items.
 */
export function NavigatorSummary({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      {children}
    </div>
  );
}

/**
 * The "N / M answered" text.
 * @param children - The count text.
 */
export function NavigatorCount({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/**
 * Wrapping row of numbered question boxes.
 * @param children - One `NavigatorBox` per question.
 */
export function NavigatorBoxes({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/**
 * One question's box: filled once its answer is saved.
 * @param href - Link to the question on the page.
 * @param label - Spoken name, saying whether the question is answered.
 * @param answered - Whether the question has a saved answer.
 * @param children - The question number shown in the box.
 */
export function NavigatorBox({
  href,
  label,
  answered,
  children,
}: {
  href: string;
  label: string;
  answered: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className={cn(
        "rounded-md border text-xs font-medium tabular-nums",
        "grid size-8 place-items-center",
        answered
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </a>
  );
}

/**
 * Phone-only button that shows or hides the question boxes.
 * @param children - The button's label.
 */
export function NavigatorFoldToggle({ children }: { children: ReactNode }) {
  const { isOpen, toggle } = useNavigatorFold();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-expanded={isOpen}
      onClick={toggle}
      className="md:hidden"
    >
      {children}
      <ChevronDown className={cn("size-4", isOpen && "rotate-180")} />
    </Button>
  );
}

/**
 * The question boxes: always shown from tablet width up, folded on phones
 * until opened. Picking a box folds them again so they don't cover the question.
 * @param children - The boxes.
 */
export function NavigatorFoldPanel({ children }: { children: ReactNode }) {
  const { isOpen, close } = useNavigatorFold();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: listens for clicks bubbling up from the box links inside
    // biome-ignore lint/a11y/useKeyWithClickEvents: the links inside already handle Enter
    <div
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) close();
      }}
      className={cn(isOpen ? "block" : "hidden", "md:block")}
    >
      {children}
    </div>
  );
}
