# Question navigator

Living spec for the bar pinned to the top of the student test page (`src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/`). It shows how far the student is through the test and lets them jump to any question.

- Decisions: `tmp/question-navigator/DECISIONS.md` (D4-D6, D9; not committed)
- Status: Behaviors 1-4 done on branch `feat/question-navigator` (commits `f4e1b31`..`1b8a435`, unpushed).
- Tests: `e2e/question-navigator.test.ts` (Playwright, `pnpm test:e2e`); `__tests__/page-deleted-question.test.tsx` reads the bar's count.

## When the bar shows

- Shown whenever the student can answer: an untimed test, a timed test after Start, and a teacher-requested redo.
- Hidden on the Start screen of a timed test and after the test is submitted (unless a redo is active).
- A test with no questions shows no bar, except a started timed test: its bar carries the countdown, which auto-submits.

## Behaviors

### 1. Answered count and one box per question
- Top row: "N / M answered", counting only questions that still exist (an answer to a deleted question does not count).
- One numbered box per question, in question order. A box is filled once that question's answer is saved with Submit Answer. Typing without saving leaves it empty.
- Each box's spoken name is "Question N, answered" or "Question N, not answered".
- The bar stays at the top of the window while the student scrolls.
- This bar replaces the old progress block in the page header (its percentage and progress bar are gone).

### 2. Jumping to a question
- Each box is a plain link to its question card (`#question-N`, from `question-anchor.ts`).
- Cards keep a scroll margin (`scroll-mt-40`) so the jumped-to title sits below the pinned bar. A bar taller than that (many rows of boxes) can still cover the title.

### 3. Timer in the bar
- On a started timed test, "Time remaining: mm:ss" (h:mm:ss from an hour) sits in the bar's top row. It is the same countdown as before, with the same one-shot auto-submit at the deadline. It no longer has its own box.

### 4. Phones
- Below the `md` breakpoint the boxes start folded behind a "Questions" button (`aria-expanded` tells whether they are shown). The count and timer stay in the bar.
- Picking a box folds the list again, so it does not cover the question.
- From `md` up the boxes are always shown and the button is hidden.
