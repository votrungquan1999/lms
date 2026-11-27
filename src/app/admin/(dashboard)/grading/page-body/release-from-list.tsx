"use client";

import { useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { z } from "zod";
import { ReleaseDialog } from "./release-dialog";
import { ReleaseStudentStatus } from "./release-students";

const rosterSchema = z.object({
  counts: z.object({
    graded: z.number(),
    waiting: z.number(),
    stillWriting: z.number(),
    redoRequested: z.number(),
    notStarted: z.number(),
  }),
  students: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      username: z.string(),
      status: z.nativeEnum(ReleaseStudentStatus),
    }),
  ),
  offerCorrectAnswers: z.boolean(),
  choiceQuestionCount: z.number(),
});

type Roster = z.infer<typeof rosterSchema>;

interface ReleaseFromListProps {
  testId: string;
  courseId: string;
  testTitle: string;
}

/** A list row's Release button: opens the release dialog on the facts the server reads when it opens. */
export function ReleaseFromList({
  testId,
  courseId,
  testTitle,
}: ReleaseFromListProps) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [failed, setFailed] = useState(false);
  // Numbers each opening so a roster answer from a closed or older opening is ignored.
  const opening = useRef(0);

  async function openDialog() {
    const mine = ++opening.current;
    setOpen(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/tests/${testId}/release-roster`);
      if (!res.ok) throw new Error(`Roster request failed: ${res.status}`);
      const parsed = rosterSchema.parse(await res.json());
      if (mine === opening.current) setRoster(parsed);
    } catch {
      if (mine === opening.current) setFailed(true);
    }
  }

  // Closing drops the roster so the next opening reads fresh facts.
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      opening.current += 1;
      setRoster(null);
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={openDialog}>
        Release
      </Button>
      {roster ? (
        <ReleaseDialog
          testId={testId}
          courseId={courseId}
          testTitle={testTitle}
          counts={roster.counts}
          students={roster.students}
          offerCorrectAnswers={roster.offerCorrectAnswers}
          choiceQuestionCount={roster.choiceQuestionCount}
          open={open}
          onOpenChange={changeOpen}
        />
      ) : (
        <Dialog open={open} onOpenChange={changeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Release grades · {testTitle}</DialogTitle>
              <DialogDescription>
                {failed
                  ? "Could not load this test's students. Close this and try again."
                  : "Loading students…"}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
