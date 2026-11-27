"use client";

import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { Progress } from "src/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { GradingMode } from "src/lib/grading-mode";
import { cn } from "src/lib/utils";
import { gradingHref } from "./href";

interface TwoPaneShellProps {
  topBar: React.ReactNode;
  /** The left pane; none leaves the main pane the full width. */
  roster: React.ReactNode;
  main: React.ReactNode;
  /** The panes fill the screen and scroll inside it, instead of the page growing. */
  fillScreen: boolean;
}

/**
 * Top bar over a two-pane grid: a fixed-width roster sidebar on the left and
 * a flexible main pane on the right. Layout-only display component
 * (server-components-rules.md forbids layout inside server components).
 */
export function TwoPaneShell({
  topBar,
  roster,
  main,
  fillScreen,
}: TwoPaneShellProps) {
  return (
    <div
      className={
        fillScreen ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"
      }
    >
      {topBar}
      <div
        className={cn(
          "grid gap-6",
          roster ? "grid-cols-[18rem_minmax(0,1fr)]" : "grid-cols-1",
          fillScreen ? "min-h-0 flex-1" : "items-start",
        )}
      >
        {roster && (
          <aside
            className={cn(
              "rounded-md border border-border bg-card p-2",
              fillScreen && "min-h-0 overflow-y-auto",
            )}
            data-testid="grading-roster"
          >
            {roster}
          </aside>
        )}
        <section
          className={fillScreen ? "min-h-0" : undefined}
          data-testid="grading-main-pane"
        >
          {main}
        </section>
      </div>
    </div>
  );
}

interface GradingProgressProps {
  numerator: number;
  denominator: number;
  label: string;
}

/**
 * Top-of-page progress bar. Renders an "X of Y" fraction next to a bar.
 * The shell passes the same counts in both modes.
 */
export function GradingProgress({
  numerator,
  denominator,
  label,
}: GradingProgressProps) {
  const value = denominator > 0 ? (numerator / denominator) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs text-muted-foreground"
        data-testid="grading-progress-fraction"
      >
        {numerator} of {denominator} {label}
      </span>
      <Progress value={value} className="w-32" />
    </div>
  );
}

interface PivotToggleProps {
  mode: GradingMode;
  basePath: string;
  /** The student and question on screen, kept when the mode changes. */
  studentId?: string;
  questionId?: string;
  needsOnly?: boolean;
}

/**
 * Pivot toggle between By-student and By-question modes. Each trigger
 * navigates via `<GuardedLink>` to the same page with `?mode=` updated; selection
 * persists in the URL so refresh and back-button work.
 */
export function PivotToggle({
  mode,
  basePath,
  studentId,
  questionId,
  needsOnly,
}: PivotToggleProps) {
  return (
    <Tabs value={mode}>
      <TabsList>
        <TabsTrigger value={GradingMode.Student} asChild>
          <GuardedLink
            href={gradingHref({
              basePath,
              mode: GradingMode.Student,
              studentId,
              questionId,
              needsOnly,
            })}
            scroll={false}
          >
            By student
          </GuardedLink>
        </TabsTrigger>
        <TabsTrigger value={GradingMode.Question} asChild>
          <GuardedLink
            href={gradingHref({
              basePath,
              mode: GradingMode.Question,
              studentId,
              questionId,
              needsOnly,
            })}
            scroll={false}
          >
            By question
          </GuardedLink>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
