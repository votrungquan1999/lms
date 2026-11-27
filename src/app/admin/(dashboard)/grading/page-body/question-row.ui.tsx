import { Check } from "lucide-react";
import { GuardedLink } from "src/app/admin/(dashboard)/guarded-link";
import { cn } from "src/lib/utils";
import { QuestionBoxState } from "./question-row-state";

export interface QuestionBoxModel {
  questionId: string;
  /** The question's number as the teacher sees it. */
  order: number;
  state: QuestionBoxState;
  href: string;
  current: boolean;
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
};

interface QuestionRowProps {
  boxes: QuestionBoxModel[];
  counts: Record<QuestionBoxState, number>;
}

/** One numbered box per question, wrapping onto more lines on a long test, with a legend of the state counts. */
export function QuestionRowUi({ boxes, counts }: QuestionRowProps) {
  return (
    <div className="space-y-1.5" data-testid="question-row">
      {/* A numeric line-height keeps the wrapped lines of boxes apart. */}
      <div
        className="flex flex-wrap gap-1.5 leading-7"
        data-testid="question-row-boxes"
      >
        {boxes.map((box) => (
          <GuardedLink
            key={box.questionId}
            href={box.href}
            scroll={false}
            aria-label={`Q${box.order}${BOX_WORDS[box.state]}`}
            aria-current={box.current ? "true" : undefined}
            className={cn(
              "relative inline-flex size-7 items-center justify-center rounded text-xs font-medium",
              BOX_STYLE[box.state],
              box.current && "ring-2 ring-teal-600 ring-offset-1",
            )}
          >
            {box.order}
            {box.state === QuestionBoxState.Graded && (
              <Check
                className="absolute -top-1 -right-1 size-3 rounded-full bg-background"
                aria-hidden
              />
            )}
          </GuardedLink>
        ))}
      </div>
      <p
        className="text-xs text-muted-foreground"
        data-testid="question-row-legend"
      >
        Correct {counts[QuestionBoxState.Correct]} · Wrong{" "}
        {counts[QuestionBoxState.Wrong]} · Partly right{" "}
        {counts[QuestionBoxState.PartlyRight]} · Graded by you{" "}
        {counts[QuestionBoxState.Graded]} · Needs grade{" "}
        {counts[QuestionBoxState.NeedsGrade]} · Blank{" "}
        {counts[QuestionBoxState.Blank]}
      </p>
    </div>
  );
}
