# Plan: Grading Page UX Improvements

Tracked as AI-Kanban card #85. Five UX changes to the admin grading page + student result view, confirmed via clarifying questions.

## Confirmed decisions

- **Save & Next (per-student view):** advance to the next **question** on the same page; **stop at the last question** (no jump to next student).
- **MC grade form:** MC is auto-graded — make it **read-only** (show the score, remove the manual Feedback/Solution/Score form entirely).
- **MC "why correct" explanation:** one optional field **per question**, added to **both** the test question form **and** the pool question form; shown to students on their result.
- **AI model:** upgrade `gemini-2.5-flash` → **`gemini-3.5-flash`** (GA, newer generation, coding-tuned). Pending final confirm; `gemini-2.5-pro` is the alternative.

---

## Step 1 — Upgrade the AI grading model

**AC:** The live grading path calls the newer Gemini model (`gemini-3.5-flash` unless changed); the model id surfaced on AI suggestions reflects the new model. No behavior change to the grading contract.

**Test type:** unit

**Files:** `src/lib/ai/ai-client.ts` (+ existing ai-client test).

---

## Step 2 — Nest the AI suggestion inside the question box

**AC:** In the per-student grading view, a free-text question's AI suggestion renders **inside** that question's bordered box (visually one unit with the question + grade form), not as a separate sibling box below it.

**Test type:** component (RTL)

**Files:** `grading-detail-student.tsx`, `grading-forms.tsx` (let the free-text question box accept the AI panel as nested content).

**Depends on:** none.

---

## Step 3 — Make MC grading read-only

**AC:** For MC questions (single/multi-select), the grading UI shows the student's selection + the auto-graded score as read-only, with **no** Score/Feedback/Solution inputs and no Save button — in **both** the per-student view and the per-question view.

**Test type:** component (RTL)

**Files:** `grading-forms.tsx` (`McQuestionGradeForm`), `grading-detail-question.tsx` (MC rows use a read-only display instead of `CompactGradeForm`).

**Risk / to verify:** confirm MC grades are auto-created on submission so a score always exists to display read-only. If not, define the read-only source before building.

**Depends on:** none.

---

## Step 4 — MC "why this answer is correct" explanation (create → store → show)

Split into layers; each layer proven before the next.

### 4a — Data model
**AC:** An MC question can carry an optional `explanation`; it round-trips through create → store → read. Non-MC questions unaffected; existing MC questions without one still load.
**Test type:** unit (`question-service`).

### 4b — Test question creation
**AC:** The add-question form on a test shows an optional explanation field for MC types only; submitting persists it.
**Test type:** component (form) + integration (create action).

### 4c — Pool question creation + compose
**AC:** The pool question form shows the same optional explanation for MC; a pooled MC question carries its explanation into the composed test question snapshot.
**Test type:** unit (compose/snapshot) + component (form).

### 4d — Student result display
**AC:** On the graded result, an MC question with an explanation shows it (gated the same way correct answers are revealed); MC questions without one show nothing new.
**Test type:** component (RTL).

**Depends on:** 4a → {4b, 4c, 4d}.

---

## Step 5 — Save & Next advances to the next question (per-student view)

**AC:** In the per-student view, "Save & Next" on a question saves that grade and moves focus to the **next question** on the page. On the **last** question it saves and stays (no next-student jump). Per-question view keeps its current next-student behavior.

**Test type:** integration (server action redirect target) + component.

**Files:** `grading-forms.tsx` (`SaveAndNextNavigation` + button), `grading-detail-student.tsx` (supply next-question anchor per row), `grading/.../actions.ts` (`saveAndJumpToNextAction` student-mode branch → redirect to next-question anchor / stop at last).

**Depends on:** Step 3 (MC read-only removes Save & Next from MC rows, so "next question" spans only the questions that still have a form).

---

## Global notes / risks

- One test at a time, meaningful red before green (project TDD rules). Consult the 4 Pillars doc before writing tests.
- Checkpoint with the user roughly every ~5 files edited (meta-rules multi-shot).
- Do not run build/dev; user validates. No package.json edits beyond `npm install` if a shadcn component is needed.
