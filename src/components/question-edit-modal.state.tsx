"use client";

import type * as React from "react";
import { type RefObject, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "src/components/ui/alert-dialog";
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
  /** The form sets this while a save runs; every close request is ignored meanwhile. */
  savingRef: RefObject<boolean>;
}

interface QuestionEditModalProps {
  /** Dialog heading; defaults to "Edit question". */
  title?: string;
  /** Disables the Edit button, e.g. while the screen is busy. */
  triggerDisabled?: boolean;
  /** Renders the form; it mounts only while the modal is open, so each open starts fresh. */
  children: (controls: QuestionEditModalControls) => React.ReactNode;
}

/**
 * Edit button plus the wide, scrolling "Edit question" modal that hosts a
 * question's edit form. The form lives inside the dialog content, so Radix
 * unmounts it on close and every open starts from the saved question.
 * @param title - Dialog heading.
 * @param triggerDisabled - Whether the Edit button is disabled.
 * @param children - Render function receiving the modal's controls.
 */
export function QuestionEditModal({
  title = "Edit question",
  triggerDisabled = false,
  children,
}: QuestionEditModalProps) {
  const [open, setOpen] = useState(false);
  const [isAskingToDiscard, setIsAskingToDiscard] = useState(false);
  const dirtyCheckRef = useRef<(() => boolean) | null>(null);
  const savingRef = useRef(false);

  /** Every way of leaving without saving (Escape, outside click, X, Cancel) ends here. */
  function requestClose(): void {
    if (savingRef.current) return;
    if (dirtyCheckRef.current?.()) setIsAskingToDiscard(true);
    else setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : requestClose())}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={triggerDisabled}
        >
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Changes apply to the question once you save.
          </DialogDescription>
        </DialogHeader>
        {children({
          onSaved: () => setOpen(false),
          requestClose,
          dirtyCheckRef,
          savingRef,
        })}
        {/* Inside the dialog so its clicks never count as "outside" the modal. */}
        <AlertDialog
          open={isAskingToDiscard}
          onOpenChange={setIsAskingToDiscard}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
              <AlertDialogDescription>
                What you changed in this question has not been saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setIsAskingToDiscard(false);
                  setOpen(false);
                }}
              >
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
