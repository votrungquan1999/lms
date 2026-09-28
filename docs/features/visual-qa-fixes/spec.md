# Visual QA Fixes — Living Spec

Fixes every finding in the visual-QA report (`qa-visual-defects/README.md`: 52 findings, 48 distinct defects), plus a batch of same-cause extras found alongside them (repeated form-resets outside the report, overflow twins on screens the report didn't cite, two hand-rolled button-links, plural-string drift, a course-page score leak) and 2 older data bugs unrelated to the report (an added option losing its server id, and answers to a deleted question skewing a student's progress). The app now wraps long text instead of scrolling it sideways, forms keep what a teacher or student typed, blank answers are handled consistently, and a student never sees a grade or answer key before the teacher releases it.

## Layout and Long Text

**Long text wraps instead of pushing the page to scroll sideways.** A teacher or student no longer scrolls left/right to read an unbroken name, pasted answer, question title, markdown table cell, multiple-choice option, or status heading (D10, D11, Y1, Y2).

- Card headers and titles wrap. The one place that still truncates is the admin top bar's breadcrumb: its current-page segment shows "…", with the full text on hover (D11) — student in-page breadcrumbs wrap by design and were left alone.
- The dialog, alert dialog and sidebar panel are pinned to a single grid column (`grid-cols-1`) or given `min-w-0`, so a long unbroken line inside them wraps instead of stretching the box to fit it.
- Title and name fields use `wrap-anywhere` to break a long unbroken run without splitting an ordinary short word.
- Rows with text beside controls: the text is allowed to shrink, counters/pills/inputs never shrink, and the row wraps when the control cluster's width varies.
- Four capped admin pages — course detail, test detail, Export Results, Import with AI — widen from `max-w-2xl` (672px) to `max-w-5xl`. That's identical to no cap at all at 1280px, but it stops the page stretching to ~1600px on very wide screens (Y5).

**Where it lives:** the global `wrap-break-word` fallback in `globals.css`; `src/components/ui/dialog.tsx`, `alert-dialog.tsx` and `sidebar.tsx` for the grid-track / `min-w-0` fix.

## Forms Keep What Was Typed

**A refused form keeps everything the user entered; a successful form clears cleanly.** Thirteen non-grading forms — Create Course, Create Test, Create Pool, Create Student, Test Settings, Compose from Pools, Add Question, Add Pool Question, both question edit panels, the student answer form, self-signup, and the Google-username form — stop wiping fields on a refused submit (D8 S1, F1, F2).

- Each form keeps `action={formAction}` on the `<form>` and wraps its submit in one shared helper, `submitWithoutReset`: `preventDefault` + `startTransition` into the server action. That stops React 19's automatic reset, which otherwise fires even after a refusal. Keeping `action=` also means a submit made before the page finishes hydrating still POSTs normally — a password can never end up in the URL.
- Because a successful submit no longer auto-clears the form, each form that should still clear on success opts in explicitly: the create dialogs remount through a `key` counter bumped on success; Create Student bumps its own form key; Compose from Pools resets its selection state on a successful compose.
- A refused save in a **question edit panel** (test or pool) or **Test Settings** keeps exactly what was typed — not the last saved values. Its fields are plain uncontrolled inputs that never remount, so the browser simply keeps whatever was last typed; nothing reverts. A **successful** save instead shows the freshly saved values once the page's data refreshes.
- The typed password is kept on a refused Create Student or self-signup (F1).
- The student answer form keeps what was typed if a submit is refused, and Submit stays disabled until there's something to submit — a free-text box needs text, a multiple-choice question needs at least one pick (F10).
- Cancelling an in-progress multiple-choice edit on the answer form restores the last saved picks, the same fix already needed for the free-text box.
- Left on React's native reset, outside these 13 forms: the grading forms (the Grade form's "Save & Next", Overall feedback, both Regenerate reason boxes) and Import JSON.

**Where it lives:** `src/lib/submit-without-reset.ts` (`submitWithoutReset`).

## Questions and Pools

**One name per question type, and one wording per answer-display option, on every screen both appear** (D9, F5, F6, D31).

- Question types: Free Text / Single Select / Multi Select / Image Answer — one shared label map (`QUESTION_TYPE_LABELS`), used by the Add forms, both edit panels, and the question list.
- Answer display: "Use the test's setting" is offered on **both** the Add forms and **both** edit panels (test and pool) — not on the Add forms only (D31). The other two choices, wherever the setting is offered (Test Settings, both Add forms, both edit panels), read "Side-by-side comparison" and "Correct answer written out plainly" — one shared label map (`ANSWER_REVEAL_MODE_LABELS`) so the wording can't drift between screens.
- Pool question previews render as markdown, like the test's own question list, instead of a raw JSON tree.
- **"Add from Pools" lists every pool, including ones with no questions — it never hides them.** An empty pool's checkbox is disabled, so it can't be ticked. A pool that was already ticked and only became empty afterward (its questions were drawn down to zero by a refused compose elsewhere) stays ticked *and* clickable, so the teacher can consciously untick it rather than losing the selection silently (F4, D47). The button itself refuses a compose that would draw zero questions, and the form always shows exactly the pools and counts it's about to submit.

**All-or-nothing vs. partial credit**: a teacher chooses this when adding or editing a multi-select question, in a test or a pool. Future submissions score by whichever rule was saved at the time; changing the rule later never re-grades a score a student already saw (D9, L6, L7 A).

**An option added while editing a question keeps students' picks attached on every later save** (D48, D56). Saving mints a fresh server id for a brand-new option; the edit panel notices its question's saved option ids changed and re-derives its option rows **in place**, during render — it does not remount. (An earlier fix remounted the panel via a `key`; it was reverted because it crashed the admin page — a server component had imported a helper from a client-only file — and it also wiped the "Question updated" success message on every options-changing save.) The pool question edit panel keeps its older, id-less behavior on purpose: pool questions carry no direct student answers, so this bug never applied there.

**When adding or editing a question is refused, the teacher keeps everything on screen** — every field, including which options are marked correct — and a retry saves exactly what's shown.

**Add Question's status message** is a full-width line below the form, not squeezed into the sidebar, with `wrap-anywhere` so a long title shows in full (D16, Y2).

**Where it lives:** `src/lib/question-labels.ts` (the shared label maps); `question-edit.state.tsx`'s `QuestionEditPanel` (`questionOptionsKey`); `compose-from-pools-form.tsx`.

## Grading and Blank Answers

**A test reads "In Progress" once a student has started it** (D5, L4, L5).

- Answered every question but never pressed Submit → **In Progress**, not Submitted.
- A timed test whose clock has started, with nothing answered yet → **In Progress**.
- A submission left entirely blank, once submitted → **Graded** (previously stuck at Submitted forever).

**Blank answers are shown honestly in both grading views** (D5, L8, L9, D37, D39).

- The progress badge admits them: "2/2 graded · 1 blank", shown on both the roster cell and the per-student pill.
- Both grading views (By-student and By-question) show "No answer — counts as 0" — read-only, with no score box.
- The results PDF marks a counted 0 as "(no answer)" instead of "Pending".
- Every question type (free text, image, multi-select) shares identical wording after submit, through one component.

**By-question "Save & Next" skips a student with no answer to the focused question**, so the teacher never lands on a blank row mid-grading.

**Practice tests are exempt from the all-blank-is-Graded rule** (D36): a blank practice submission reads "Submitted", the same as an answered practice submission.

**An answer to a question the teacher has since deleted is treated as if it were never given** — ignored in progress counts and in status, both before and after submit, so a student is never stuck at "Submitted" because of a question that no longer exists (D49, D53).

**Where it lives:** `src/components/blank-answer-note.ui.tsx` (`BlankAnswerNote`); `src/lib/test-status-service.ts` (`TestStatusService`, which injects `QuestionService` to filter out deleted-question answers, and `TestStartService`/`TestService` for the in-progress and practice-test rules).

## What Students See Before Release

**A student never sees a result the teacher hasn't released** (D6, D7, D12, D13, S5, D46).

- **Status masking**: a Graded test reads "Submitted" to the student until grades become visible, through one rule that the test page, course page and dashboard all call. The teacher's own grading view is unaffected — it still reads "Graded".
- **Answer chips while the key is withheld**: the student's own multiple-choice picks show as neutral grey "your pick" chips, in both the submitted view and the graded-but-withheld view — nothing hints whether a pick was right or wrong (L1, L2).
- **Teacher grading views** (both By-student and By-question) show the student's picks in colour — green for right, red for wrong — but with **no missed-correct outline**, as before this work; the outline had crept in as an unasked side effect of the student-side fix, and the product owner chose to restore the old look (D46).
- **A finalized practice test** shows its "Your Answer" chips in colour again, and the dedicated Practice Reveal block is the only place that also shows a missed-correct outline — the two no longer both render it (D46, which restored both looks after an earlier fix removed the teacher outline *and* greyed out the practice chips as unintended side effects).
- **The course page's average score** never leaks before release — it goes through the same guarded, visibility-checked lookup.
- **Release controls** read "Grades released at <date>" / "Correct answers released at <date>" (the same wording Test Settings uses) whenever auto-show is off (D14, D19, L10).

**Where it lives:** `src/lib/grade-visibility-service.ts` (`GradeVisibilityService.getStudentFacingStatus`, `canRevealGrades`); `src/components/mc-answer-chips.tsx` (`McAnswerChips`'s `colorPicks` / `showMissedCorrect` flags — both required props, so a future caller can't silently fall back to an unsafe default).

## Sign-In and Join

**Every sign-in and join screen offers a working way forward** (D9, D20, D42, D45, D50).

- **Expired sign-in**: lands on the home page instead of an error.
- **Login error**: names the blank field — "Enter your username" or "Enter your password" (F7).
- **Expired invite**, whether hit during self-signup or the Google-username form: both forms offer "Student sign in" and "Home" links (D42).
- **Refused self-signup** keeps all three of its real fields — Full Name, Username, Password — if validation fails. There is no password-confirm field on this form (F1).
- **A spaces-only password counts as blank**, both at login and at account creation, so an account that could never be logged into can never be created in the first place (D45, D50). Consequence: an *existing* account whose password happens to be only spaces can no longer log in either.
- **A signed-in visitor with no role** (for example, a Google sign-in stopped mid-join) is signed out at `/redirect`, the same as an expired session (D20).

**`/redirect` sends an admin to `/admin/dashboard`, a student to `/student/dashboard`, and everyone else — no session, an expired one, or a valid session with no role — home to `/`, after clearing the session.** It clears 4 cookie names: `better-auth.session_token`, `__Secure-better-auth.session_token`, and their dash-joined counterparts `better-auth-session_token` and `__Secure-better-auth-session_token`. This app never writes that dash-joined pair itself, but better-auth's own `getSessionCookie` helper falls back to checking for it, and the reverse proxy reacts to whatever `getSessionCookie` sees — so leaving a stale one of those uncleared would loop the proxy back to `/redirect` forever.

**Where it lives:** `src/app/redirect/route.ts`; `src/app/join/[token]/self-signup-form.tsx` and `google-username-form.tsx`.

## Buttons and Wording

**Action buttons look like the app's buttons and match the button beside them.**

- "Return Home" matches "Sign Out" in size and shape.
- The two join-page buttons are the same size — "Continue with Google" is no longer oversized (Y14).
- "Retry with AI" looks like "Edit".
- "Import Questions with AI" and "Grade Students" are real buttons, not styled links.
- Choice controls (native checkboxes/radios) render in the app's primary colour instead of browser blue, through one global `accent-color` rule (Y13).

**Progress and status reporting**:
- Field errors appear under the input with `aria-invalid` and `aria-describedby`, not a page-level banner (D15).
- "Settings saved" in Test Settings disappears the instant any control in the form changes again — one `onChange` on the `<form>` element catches every field through event bubbling, not per-control dirty tracking (D28).
- "Settings saved" also stays hidden while a save is in flight, and it won't reappear for the *next* save if the form changed since that submit was fired (D33).
- Test Settings posts even with JavaScript fully off: its server action is passed straight into `action={formAction}` on the `<form>` itself, so pressing Save with no JavaScript still does a normal POST (D34). An earlier version of the "Settings saved" fix had accidentally broken this no-JS path; it was corrected once the regression was found.
- Create Course/Test/Pool/Student dialogs drop stale error banners when reopened (D26).
- Five "student(s) / question(s)" strings now read naturally — "1 student · 3 questions" — through one shared `pluralize` helper. Roughly 20 other inline plurals that already read correctly were left alone (D17).
- "You have answered the question." for a one-question test; "You have answered all 5 questions." for many (Y10).
- The countdown reads `h:mm:ss` once past an hour, `mm:ss` under it (Y11).

**Where it lives:** `src/lib/pluralize.ts`.

## Data Fixes

**Bulk import flags a spaces-only password at the preview stage**, before the admin ever confirms the import — a new `PreviewStatus.PasswordBlank` check, mirroring the existing too-short-password check, so the admin never imports an account that could never log in (D55).

**An option added while editing a question keeps students' picks attached on later saves** — see Questions and Pools above (D48, D56).

**An answer to a deleted question no longer skews a student's progress or status** — see Grading and Blank Answers above (D49, D53).

**Where it lives:** `src/app/admin/(dashboard)/students/bulk-import.types.ts` and `bulk-import-actions.ts`.

## Deliberately Unchanged / Out of Scope

- **Redo status, and a timed test that expired without auto-submitting.** Opening a redo doesn't change what status the test reads; separately, a timed test whose clock ran out without ever auto-submitting can never be submitted at all — the student is stuck. Both filed as card #287 (S6), along with a third item: old free-text grades survive a redo resubmission unchanged.
- **Grading forms still use React's native reset**, not the shared `submitWithoutReset` helper: the Grade form ("Save & Next"), Overall feedback, both Regenerate reason boxes, and Import JSON. They sit outside the 13 non-grading forms this run touched.
- **An existing spaces-only-password account can no longer log in.** New accounts can no longer be *created* with one (D50), but D45's accepted consequence is that an account already on file with a spaces-only password is locked out too — there is no migration for it.
- **Four smaller items, reported and left as-is:** self-signup shows the spaces-only-password refusal as a form-level message rather than attached to the password field (this form has no per-field error slots); the bulk-import status badge shows the raw value `password-blank`, the same way it already shows `password-too-short`; the status check now does one extra question lookup per call; and an option-row edit typed into the question editor while an options-changing save is still in flight gets overwritten by that save's freshly synced rows once it resolves.
