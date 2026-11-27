"use client";

import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { Progress } from "src/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { GradingMode } from "src/lib/grading-mode";
import { gradingHref } from "./href";

interface GradingScreenLayoutProps {
  topBar: React.ReactNode;
  main: React.ReactNode;
}

/**
 * The top bar over the focused student's or question's grading pane. The pane
 * fills the screen and scrolls inside it, instead of the page growing.
 * Layout-only display component (server-components-rules.md forbids layout
 * inside server components).
 */
export function GradingScreenLayout({
  topBar,
  main,
}: GradingScreenLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {topBar}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6">
        <section className="min-h-0" data-testid="grading-main-pane">
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
