"use client";

import { useState } from "react";
import { Button } from "src/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "src/components/ui/collapsible";

interface CollapsibleQuestionDescriptionProps {
  /** The question's description text to display. */
  description: string;
}

/**
 * Collapsible question description for the grading view. Collapsed by default;
 * a "View more" / "Show less" toggle expands and re-collapses it. The
 * Collapsible is controlled by a single `open` state so the button label and
 * the open state share one source of truth.
 * @param props.description - The question description text to display.
 * @returns The toggle + collapsible description region.
 */
export function CollapsibleQuestionDescription({
  description,
}: CollapsibleQuestionDescriptionProps) {
  const [open, setOpen] = useState(false);

  if (!description) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="question-description-toggle"
        >
          {open ? "Show less" : "View more"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        data-testid="question-description-content"
        className="text-sm text-muted-foreground whitespace-pre-wrap"
      >
        {description}
      </CollapsibleContent>
    </Collapsible>
  );
}
