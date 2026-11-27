"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { useLeaveGuard } from "src/app/admin/(dashboard)/leave-guard.state";
import { cn } from "src/lib/utils";
import { QuestionBoxState } from "./question-row-state";
import { StillWritingConfirm, useStillWriting } from "./still-writing-confirm";
import type { StudentPickerRow } from "./student-picker-rows";

export interface QuestionBoxModel {
  /** Identifies the box: a question id, or a student id in By question. */
  id: string;
  /** What the box shows: the question's number, or the student's initials. */
  text: string;
  /** Names what the box opens, e.g. "Q3" or the student's name. */
  label: string;
  state: QuestionBoxState;
  /** Where the box goes; null for a box that cannot be opened. */
  href: string | null;
  current: boolean;
  /** A still-writing student the teacher must confirm before her box opens. */
  askStudent?: StudentPickerRow;
}

const BOX_STYLE: Record<QuestionBoxState, string> = {
  [QuestionBoxState.Plain]: "border bg-background text-muted-foreground",
  [QuestionBoxState.Correct]: "bg-green-100 text-green-800",
  [QuestionBoxState.PartlyRight]: "bg-sky-100 text-sky-800",
  [QuestionBoxState.Wrong]: "bg-red-100 text-red-800",
  [QuestionBoxState.Graded]: "bg-green-100 text-green-800",
  [QuestionBoxState.NeedsGrade]: "bg-amber-100 text-amber-800",
  [QuestionBoxState.Blank]:
    "border border-dashed border-gray-400 bg-background text-muted-foreground",
  [QuestionBoxState.Answered]: "bg-slate-100 text-slate-700",
  [QuestionBoxState.StillWriting]: "bg-blue-100 text-blue-800",
  [QuestionBoxState.RedoRequested]: "bg-gray-200 text-gray-600",
};

/** What a box says in words, so its state is not carried by colour alone. */
const BOX_WORDS: Record<QuestionBoxState, string> = {
  [QuestionBoxState.Plain]: "",
  [QuestionBoxState.Correct]: " correct",
  [QuestionBoxState.PartlyRight]: " partly right",
  [QuestionBoxState.Wrong]: " wrong",
  [QuestionBoxState.Graded]: " graded",
  [QuestionBoxState.NeedsGrade]: " needs grading",
  [QuestionBoxState.Blank]: " blank",
  [QuestionBoxState.Answered]: " answered",
  [QuestionBoxState.StillWriting]: " still writing",
  [QuestionBoxState.RedoRequested]: " redo requested",
};

interface QuestionRowProps {
  boxes: QuestionBoxModel[];
  /** The state counts in words, e.g. "Needs grade 2 · Blank 0". */
  legend: string;
  needsOnly: boolean;
  /** The row's own address with the filter flipped. */
  toggleHref: string;
  nothingNeedsGrading: boolean;
  /** Students without a box because they have not started, or null when the row has none to count. */
  notStarted?: number;
  testTitle?: string;
  /** A practice test has no grading, so the row offers no "Needs grading only" filter. */
  isPractice?: boolean;
}

const BOX_CLASS =
  "relative inline-flex size-7 items-center justify-center rounded text-xs font-medium";

/** One box per question or per student, wrapping onto more lines when long, with a legend of the state counts. */
export function QuestionRowUi({
  boxes,
  legend,
  needsOnly,
  toggleHref,
  nothingNeedsGrading,
  notStarted,
  testTitle = "",
  isPractice = false,
}: QuestionRowProps) {
  const router = useRouter();
  const { requestLeave } = useLeaveGuard();
  const { confirm } = useStillWriting();
  // The still-writing student whose box the teacher pressed and has not confirmed.
  const [asking, setAsking] = useState<StudentPickerRow | null>(null);
  const askingHref = boxes.find(
    (box) => box.askStudent?.id === asking?.id,
  )?.href;

  return (
    <div className="space-y-1.5" data-testid="question-row">
      {/* A numeric line-height keeps the wrapped lines of boxes apart. */}
      <div
        className="flex flex-wrap gap-1.5 leading-7"
        data-testid="question-row-boxes"
      >
        {boxes.map((box) => {
          const label = `${box.label}${BOX_WORDS[box.state]}`;
          const className = cn(
            BOX_CLASS,
            BOX_STYLE[box.state],
            box.current && "ring-2 ring-teal-600 ring-offset-1",
          );
          if (box.href === null) {
            return (
              <button
                key={box.id}
                type="button"
                disabled
                aria-label={label}
                title={label}
                className={cn(className, "cursor-not-allowed")}
              >
                {box.text}
              </button>
            );
          }
          if (box.askStudent) {
            const student = box.askStudent;
            return (
              <button
                key={box.id}
                type="button"
                aria-label={label}
                aria-current={box.current ? "true" : undefined}
                className={className}
                onClick={() => setAsking(student)}
              >
                {box.text}
              </button>
            );
          }
          return (
            <GuardedLink
              key={box.id}
              href={box.href}
              scroll={false}
              aria-label={label}
              aria-current={box.current ? "true" : undefined}
              className={className}
            >
              {box.text}
              {box.state === QuestionBoxState.Graded && (
                <Check
                  className="absolute -top-1 -right-1 size-3 rounded-full bg-background"
                  aria-hidden
                />
              )}
            </GuardedLink>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-xs">
        {!isPractice && (
          <GuardedLink
            href={toggleHref}
            scroll={false}
            aria-pressed={needsOnly}
            className={cn(
              "rounded border px-2 py-0.5",
              needsOnly && "border-teal-600 bg-teal-50 text-teal-800",
            )}
          >
            Needs grading only
          </GuardedLink>
        )}
        {needsOnly && nothingNeedsGrading && (
          <span className="text-muted-foreground">Nothing needs grading</span>
        )}
        {notStarted !== undefined && notStarted > 0 && (
          <span className="text-muted-foreground">
            {notStarted} not started
          </span>
        )}
      </div>
      <p
        className="text-xs text-muted-foreground"
        data-testid="question-row-legend"
      >
        {legend}
      </p>
      <StillWritingConfirm
        student={asking}
        testTitle={testTitle}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          if (asking) confirm(asking.id);
          setAsking(null);
          if (askingHref) requestLeave(() => router.push(askingHref));
        }}
      />
    </div>
  );
}
