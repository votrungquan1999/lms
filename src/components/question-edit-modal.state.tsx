"use client";

import type * as React from "react";
import { type RefObject, useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "src/components/ui/dialog";

/** What the modal hands the form it hosts. */
export interface QuestionEditModalControls {
  /** Call after a successful save; closes the modal. */
  onSaved: () => void;
  /** Call when the teacher asks to leave without saving. */
  requestClose: () => void;
  /** The form registers a "has unsaved changes" check here. */
  dirtyCheckRef: RefObject<(() => boolean) | null>;
}

interface QuestionEditModalProps {
  /** Renders the form; it mounts only while the modal is open, so each open starts fresh. */
  children: (controls: QuestionEditModalControls) => React.ReactNode;
}

/**
 * Edit button plus the wide, scrolling "Edit question" modal that hosts a
 * question's edit form. The form lives inside the dialog content, so Radix
 * unmounts it on close and every open starts from the saved question.
 * @param children - Render function receiving the modal's controls.
 */
export function QuestionEditModal({ children }: QuestionEditModalProps) {
  const [open, setOpen] = useState(false);
  const dirtyCheckRef = useRef<(() => boolean) | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit question</DialogTitle>
          <DialogDescription>
            Changes apply to the question once you save.
          </DialogDescription>
        </DialogHeader>
        {children({
          onSaved: () => setOpen(false),
          requestClose: () => setOpen(false),
          dirtyCheckRef,
        })}
      </DialogContent>
    </Dialog>
  );
}
