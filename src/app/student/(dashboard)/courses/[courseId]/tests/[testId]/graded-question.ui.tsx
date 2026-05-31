"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader } from "src/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "src/components/ui/collapsible";

interface GradedQuestionShellProps {
  /** Header line, e.g. "Question 3: Reverse string". */
  questionLabel: string;
  /** Trailing header content — the score badge (and any auto-graded note). */
  headerBadge: ReactNode;
  /** Teacher comment shown as a one-line preview only while collapsed. */
  commentPreview?: string | null;
  /** Whether the card starts expanded (non-perfect scores) or collapsed. */
  defaultOpen: boolean;
  /** Expanded detail: prompt, answer, and grade panels. */
  children: ReactNode;
}

/**
 * Collapsible card wrapper for a single graded question. The header row is the
 * toggle (question label + score badge + chevron); a perfect score collapses
 * the card by default so the page stays scannable, while a non-perfect score
 * opens it. When collapsed, a teacher-comment preview line is shown so the
 * student still gets a hint of the feedback without expanding.
 * @param props - See {@link GradedQuestionShellProps}.
 */
export function GradedQuestionShell({
  questionLabel,
  headerBadge,
  commentPreview,
  defaultOpen,
  children,
}: GradedQuestionShellProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CollapsibleTrigger className="group/trigger flex w-full items-center justify-between gap-3 text-left">
            <span className="min-w-0 truncate text-lg font-semibold">
              {questionLabel}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {headerBadge}
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-180" />
            </span>
          </CollapsibleTrigger>
          {!open && commentPreview && (
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              {commentPreview}
            </p>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Collapsible wrapper for a graded question's prompt. Collapsed by default — on
 * the graded view the answer and feedback matter more than re-reading the
 * question, so the prompt is tucked behind a "Show question" toggle.
 * @param props.children - The rendered question prompt.
 */
export function QuestionPromptCollapsible({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group/prompt -ml-2 h-7 gap-1 text-muted-foreground"
        >
          <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/prompt:rotate-90" />
          {open ? "Hide question" : "Show question"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
