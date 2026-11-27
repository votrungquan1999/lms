"use client";

import { ChevronDown } from "lucide-react";
import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { Button } from "src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";

interface QuestionPickerUiProps {
  /** The question on screen, e.g. "Q24 Count the vowels". */
  currentLabel: string;
  currentId: string | null;
  /** Every question in order, each with the link that opens it. */
  items: { id: string; label: string; href: string }[];
}

/** The question picker: a dropdown naming the open question, listing every question. */
export function QuestionPickerUi({
  currentLabel,
  currentId,
  items,
}: QuestionPickerUiProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Question picker"
          className="min-w-0 max-w-64 gap-1"
        >
          <span className="truncate font-medium">{currentLabel}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-96 w-72 overflow-y-auto"
      >
        {items.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <GuardedLink
              href={item.href}
              scroll={false}
              aria-current={item.id === currentId ? "true" : undefined}
            >
              <span className="truncate">{item.label}</span>
            </GuardedLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
