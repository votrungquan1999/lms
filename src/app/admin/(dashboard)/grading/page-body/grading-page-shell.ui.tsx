"use client";

import Link from "next/link";
import { Progress } from "src/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { GradingMode } from "./grading-page-body.type";
import { gradingHref } from "./href";

interface TwoPaneShellProps {
  roster: React.ReactNode;
  main: React.ReactNode;
  pivot: React.ReactNode;
  progress: React.ReactNode;
}

/**
 * Two-pane grid: pivot toggle at the top, then a fixed-width roster sidebar
 * on the left and a flexible main pane on the right. Layout-only display
 * component (server-components-rules.md forbids layout inside server
 * components).
 */
export function TwoPaneShell({
  roster,
  main,
  pivot,
  progress,
}: TwoPaneShellProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        {pivot}
        {progress}
      </div>
      <div className="grid grid-cols-[18rem_1fr] gap-6">
        <aside
          className="rounded-md border border-border bg-card p-2"
          data-testid="grading-roster"
        >
          {roster}
        </aside>
        <section data-testid="grading-main-pane">{main}</section>
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
 * Numerator + denominator are mode-dependent and computed by the shell.
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
}

/**
 * Pivot toggle between By-student and By-question modes. Each trigger
 * navigates via `<Link>` to the same page with `?mode=` updated; selection
 * persists in the URL so refresh and back-button work.
 */
export function PivotToggle({ mode, basePath }: PivotToggleProps) {
  return (
    <Tabs value={mode}>
      <TabsList>
        <TabsTrigger value={GradingMode.Student} asChild>
          <Link
            href={gradingHref({ basePath, mode: GradingMode.Student })}
            scroll={false}
          >
            By student
          </Link>
        </TabsTrigger>
        <TabsTrigger value={GradingMode.Question} asChild>
          <Link
            href={gradingHref({ basePath, mode: GradingMode.Question })}
            scroll={false}
          >
            By question
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
