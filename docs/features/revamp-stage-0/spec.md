# Revamp stage 0: sign-in cards, redo, timed hand-in

Living spec for stage 0 of the LMS revamp. It describes the code on branch `feat/revamp-stage-0` (10 commits on base `1bf06b76`, not pushed, no PR yet).

- Decision numbers (D1-D30) come from the stage decision log (workspace `tmp/revamp-stage-0/DECISIONS.md`, not committed; also mirrored to AI-Kanban card #599). The behaviors below restate what the code does, so this file stands alone.
- "Teacher" in the UI is the admin role in code.
- Stage 0 changes only the student sign-in and join pages, the timed-test redo and hand-in flow, two grading fixes, and test delete. The teacher login page is unchanged (D4).

## Status

- All 10 behaviors done, one commit each (`9bfb40ee` ... `3ed148b5`, see [Commits](#commits)).
- Final check after the last fix round: see [Verification](#verification).

## Behaviors

### 1. Student sign-in card

- Page `/student/login` shows one card: title "Student sign in", subtitle "Sign in to see your courses and tests.", username and password fields, button "Sign in".
- Under the form: an "or" divider, the "Continue with Google" button, and the help line "Joined with Google? Use Continue with Google."
- Wrong credentials show "Invalid username or password" in an alert above the button. Typed values stay.
- Blank fields: "Enter your username and password" when both are empty, otherwise "Enter your username" or "Enter your password" under the field. Whitespace-only counts as empty.
- Google returns with an error: the card shows "Google sign-in didn't finish. Please try again." Any error value shows it; no error code is shown (D11).
- That Google message clears as soon as the student submits the username/password form, so two errors never show at once (D23).
- If the Google address cannot be started, the button shows "Failed to start sign-in. Please try again." (D11 covers the returned-error case only.)
- A visitor who is already signed in is redirected first: admin to `/admin/dashboard`, student to `/student/dashboard`. The card is never shown to them.

### 2. Google joiner signs in and lands on home

- A student who joined by Google signs in with "Continue with Google" and lands on `/student/dashboard`.
- A student whose join request is still pending is also classified as a student, so they land on the dashboard too.

### 3. Google account with no student profile

- A Google (or any) account with no student profile, or whose school is gone, sees the card "Account not set up" (real heading) with "This account isn't set up for this school yet." and a "Sign out" button.
- Sign out returns to `/`. Signing in again shows the student card, not "Account not set up".
- Retrying Google goes through the account picker (see 1).
- The teacher login page keeps its own "Account Not Set Up" card (D4).

### 4. Teacher uses "Continue with Google" on the student page

- Lands on `/admin/dashboard`.
- The teacher login page's Google button is unchanged: teachers only (D4).

### 5. Join link shows the shared card in every state

Signed-out visitor (`/join/<token>`):

- Card eyebrow "You're invited to join", course title, "Create an account to ask to join."
- Sign-up fields: "Full name", username with hint, password with "At least 8 characters.", note "You sign in with this, not an email.", button "Create account".
- "Continue with Google" with the account picker forced (D12, D18). The callback keeps the `?google=1` marker.
- "Already have an account?" with a "Sign in" link to `/student/login`.
- Header "Sign in" link, shown only in this signed-out state (D9). Not on invalid, signed-in-student, or Google-outcome states.

Other states:

- Google, no username yet: "Choose a username to finish joining with Google", button "Finish joining".
- Signed-in student: avatar initials, "Signed in as <name> · @username", heading "Join <course>?", button "Request to join" (pending "Requesting…").
- Request sent: heading "Request sent", text "Your request to join "<course>" is now waiting for your teacher to approve.", link "Go to my courses" (`/student/dashboard`) (D15).
- A refused request keeps the form and shows the alert; it never shows "Request sent".
- Invalid or dead invite: "Invitation no longer valid", links "Student sign in" and "Home". Same screen for all three reasons.
- Still on older wording (no design frame, kept on purpose): email sign-up success, Google "Provisioned" success, and "already waiting" text all say "waiting for admin approval".

### 6. Redo on a handed-in timed test gives a fresh start

- Teacher "Request Redo" on a student who already handed in a timed test clears that student's running timed start. The clear runs before the redo is recorded (D13, D19, D26a).
- A teacher who requests a redo for a student still writing keeps the start and the original deadline (D13).
- A second "Request Redo" while a redo is already open keeps the running deadline (D25).
- The redo attempt shows the Start gate with the full time limit. Answer saves and submit work during the new attempt.
- Practice tests cannot be redone (unchanged).

### 7. Expired timed attempt is handed in with saved answers

Server hand-in:

- Runs when a timed attempt is past start + time limit + 60 s grace and has no active hand-in. The grace lets the browser's own 00:00 submit win (D6).
- Saves the saved answers as the hand-in, with `submittedAt` = start + time limit, not the time the page was opened (D3).
- Auto-grades the answers, except for practice tests, which are handed in but never graded.
- A zero-question test is never handed in (D10).
- An attempt with nothing saved is handed in as blank (R16).
- Runs inside the per-student status lookup, so every page that shows a student's status hands in first (D2, D6):
  - student home, student course page, student test page;
  - teacher dashboard, teacher course page, grading hub, grading page (shell and detail, both modes);
  - the results-report download.
- Teacher test page and the annotation service do not hand in.
- Writes only when a stuck attempt exists. With the unique index in place (see [Data rules](#data-rules)), two pages racing never create two active hand-ins: the second insert is refused and treated as already handed in (D6, D16).
- A stuck attempt from before go-live is handed in the same way; no reset is done (D7).

Browser hand-in:

- A browser hand-in inside the 60 s grace is recorded at the current time, as before (R17).
- A browser hand-in after the grace is accepted and recorded at the deadline, not refused (D14).
- Answer saves after the deadline are still refused.

Redo with an expired start:

- When a redo attempt's time runs out, the server hand-in swaps the old active hand-in for the new one in one write (fresh id, `submittedAt` = redo deadline, release cleared), so no page ever sees the student without an active hand-in — even without the index (D30).
- Only one page wins the claim on the open redo request; the others treat it as handed in. The claim also closes any other open redo rows (D26b).
- The replaced attempt is kept as a soft-deleted history row with its old release audit.
- The browser's own redo submit (delete then submit) is unchanged (D30).

### 8. Submitted student never sees the Start gate

- A student who already handed in sees their saved answers and result, never the Start gate, even after a time limit is added to the test (startGate requires the student can still answer).
- A student with an open redo does see the Start gate with the full time (see 6).

### 9. Teacher can press "Submit Anyway" and save the grade

- On a grade form for a student still writing, "Submit Anyway" in the confirm dialog submits the grade form (the button is tied to the form by id, since the dialog is portalled out of it).
- The grade is saved. The save writes only the grade, not the student's submission.
- "Save & Next" keeps today's behavior: no warning for a still-writing student (D8).

### 10. Deleting a test from its own page

- "Delete Test" → confirm → lands on the course page (`/admin/courses/<courseId>`). The deleted test is gone from the list.
- A refused or failed delete stays on the test page and shows the error.

## Data rules

- Only one active hand-in per student per test: partial unique index on `test_submission {testId, studentId}` where `deletedAt` is null (D16).
- Boot exception (D17, recorded here per D22): this one index is boot-tolerant. If the build fails on duplicate active rows already in live data, the app logs one line and starts without the index. The build is retried on every server start, so the rule switches on once the duplicates are gone. Every other unique index still stops the boot on failure.
- While the index is missing, insert-if-absent is only a check, so two simultaneous first hand-ins can both write a row. Accepted under D17. The redo claim still lets only one page replace a redo's old hand-in.
- Redo flow: the old hand-in is soft-deleted (`deletedAt`) and kept as history, never hard-deleted.
- The timed start is soft-deleted by a redo, and a new start is recorded afterwards.

## Key files

- Student sign-in: `src/app/student/login/page.tsx`, `student-login-form.tsx`, `google-sign-in-button.tsx`; shared card `src/components/sign-in-card.tsx`.
- Join page: `src/app/join/[token]/page.tsx`, `join-page.ui.tsx`, `self-signup-form.tsx`, `google-join-button.tsx`, `google-username-form.tsx`, `request-to-join-form.tsx`, `actions.ts`.
- Hand-in: `src/lib/test-submission-service.ts` (`handInIfExpired`, `replaceActive`, `insertIfAbsent`, `submitTest`); deadline check `src/lib/enforcement-deadline.ts`.
- Status: `src/lib/test-status-service.ts` (`getStatus` runs the hand-in first).
- Redo: `src/lib/redo-request-service.ts` (`claimActiveRedoRequest`), `src/lib/test-start-service.ts` (`clearActiveStart`), `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions.ts` (`requestRedoAction`).
- Student test page gate: `src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/page.tsx`; redo submit `actions.ts` there.
- Index: `src/lib/database.ts` (`ensureIndexes`).
- Grading: `grading/grading-forms.tsx` (Submit Anyway); readers `grading-page-shell.tsx`, `grading-detail-student.tsx`, `grading-detail-question.tsx`, `src/lib/results-report-assembler.ts`.
- Test delete: `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/actions.ts` (`deleteTestAction`).
- E2E: `e2e/student-google-sign-in.test.ts` (5 tests), `e2e/timed-test-recovery.test.ts` (3), `e2e/grading-submit-anyway.test.ts`, `e2e/delete-test-landing.test.ts`; helpers `e2e/seed.ts` (`insertTestStart`), `e2e/hydrated.ts`.
- Visual tour: `e2e/visual/entry.tour.ts`.

## Commits

One commit per behavior (strategy per-behavior, no co-author trailers):

- 1 `9bfb40ee` one sign-in card with Google and username + password
- 2 `f8e02ade` Google joiner signs in and lands on home
- 3 `9f6d52f1` no-profile Google account sees "Account not set up"
- 4 `c5472030` teacher via student Google lands on teacher side
- 5 `7d7d5031` join link shows the same card in every state
- 6 `304a0b88` redo on a handed-in timed test gives a fresh start
- 7 `f7e041cb` expired timed attempt is handed in
- 8 `c8d409b1` submitted student sees result, never the Start gate
- 9 `f37feab9` "Submit Anyway" saves the grade
- 10 `3ed148b5` delete from the test page lands on the course page

## Verification

- Quality gates after behaviors 1-3, 4-6, 7-9: fixed 6, 5 and 4 findings respectively, each folded into its behavior commit. One flake in the status-count histogram test was not reproduced in 40 runs and is not fixed.
- Conformance: each behavior has a validation note (`tmp/revamp-stage-0/VALIDATION_STEP_*.md`). All 10 are valid. Caveat: the redo-timer tests in the grading actions pin mock calls rather than a real-database outcome.
- Visual: the student login and join states were screenshotted at 1440 and 390 wide and compared with the ST-Login / ST-Join designs (quality gates 3 and 6); no clipping or overlap at phone width.
- Adversarial revalidation (R1-R26): the findings that remained were fixed as D25, D26 and D27, and D30 closed the redo swap gap. Remaining low-severity notes are under [Open items](#open-items).
- Mutation pass: 28 mutants, 18 killed and 10 survived at first. Tests were added (D29), then the 13-mutant rerun killed 10 and left 3 on the new swap code. The 3-mutant rerun killed all 3. Final: every survivor killed (the 18 first-pass kills were not re-run).
- Final check after the last fix round (current code): vitest 2083 tests green (scratch probes removed); e2e 142 of 142 passed; `tsc --noEmit` clean; `pnpm lint` clean after a format fix in `e2e/delete-test-landing.test.ts`.

## Open items

- Visual entry tour: 13 of 14 pass. The `/redirect` step expects a 500, but the route now redirects (200). Pre-existing, not from this branch; fix separately.
- Redo race, two open redo rows from a double press at the same moment as expiry: two callers can each claim one, and a claim winner that crashes mid-hand-in leaves the redo resolved without a new hand-in. The teacher can request again (D26b note).
- Browser redo submit still runs delete-then-submit; a server hand-in landing between those steps makes the browser's submit fail with "already submitted" while the state is correct (D30).
- Wording is mixed: request-sent says "your teacher", while older join messages say "admin approval".
- Pre-existing, left for stage 2 (D28): a teacher's grade on a multiple-choice question for a still-writing student is overwritten by the auto-grade when the student hands in.
- `src/lib/test-submission-service.ts` keeps an old comment citing decision numbers (D2/D9). It predates this stage; reword it to a plain reason.
- Pre-existing, outside stage 0: a Google user who quits at "choose a username" and later opens the join link without `?google=1` sees the sign-up form whose header "Sign in" leads to "Account not set up". Candidate for stage 5.
- Pre-existing: when the sign-in state cookie is missing or expired, Google sign-in lands on the default auth error page, not the student card (outside D11).
- Not yet pushed, no PR opened.
