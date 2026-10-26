# Student View Preview

## Feature Summary

Teachers can preview how students will see questions before or after import. A "Teacher view / Student view" toggle on the AI import review screen and on the test page flips the question list to show questions as students see them: no answer keys, model answers, explanations, or saving. The same work fixes three authentication bugs found along the way (stale login redirect, missing "Account Not Set Up" state, Google join loop) and closes an answer-key leak on the student test page.

## Behaviors and Acceptance Criteria

**Behavior 1: Stale login redirect.** A visitor holding a dead login lands on the home page signed out, not on an error page or in a redirect loop. A valid admin or student is sent to their dashboard.
- **Route handler.** `GET /redirect` (`src/app/redirect/route.ts`) reads the session from the request headers; admin goes to `/admin/dashboard`, student to `/student/dashboard`.
- **Everything else is signed out.** Dead, unknown, or role-less sessions get better-auth's own expiry `Set-Cookie` headers, then a redirect to `/`.
- **All accepted cookie names expire.** Every login-cookie name the proxy accepts is expired when present on the request; `__Secure-` names carry the `Secure` flag so browsers honour the expiry.
- **Lookup errors are not caught.** An outage shows an error page and keeps the cookie, so valid users are never signed out by one.

**Behavior 2: Import screen Student view.** A teacher reviewing AI-drafted questions can flip to Student view and see each draft formatted and numbered as it will be saved, with answer choices clickable but nothing recorded.
- **Shared components.** The student question card, answer controls, list and toggle live in `src/components/`; the student page and both previews use them.
- **Draft adapter.** Drafts become student cards (id, order, title, content, type, options all `isCorrect: false`, attached pictures); the answer key is left out.
- **Toggle.** Starts on Teacher view; two buttons with `aria-pressed`. The teacher list stays mounted but hidden in Student view so open edits survive a flip; Student view renders only while selected.
- **Rejection reason.** In Student view, a rejected import shows its reason under the Import button as `Question N: title — reason`, where N is the card's own number. An empty or whitespace-only title drops the colon and title (`Question N — reason`). Teacher view shows `Question N — reason` on the rejected card, with the same N as its header. Applies to server rejections and picture-upload failures.
- **New file resets the screen.** Parsing a new file remounts the review screen on Teacher view.
- **Width.** The import screen's section is widened to `max-w-5xl`, the student test page's column.

**Behavior 3: Import preview numbering.** Drafts are numbered as they will be saved: after the test's highest live question when adding, from 1 when replacing.
- **Add mode.** The first number is the highest existing question `order` plus 1, computed by the import page from the questions loaded when the screen opened (a deleted question leaves a gap; a rare concurrent change is accepted).
- **Replace mode.** Numbering starts at 1.
- **Per-card numbers.** The list shows each card's own `order`; Teacher cards (`#N` header) and the Unused-picture question picker use the same numbers and follow the Add/Replace switch live; the import adapter assigns `order` from the first number.

**Behavior 4: Test page Student view.** A teacher on a test page can flip to Student view and see all saved questions as students see them.
- **Typed server mapping.** The page maps each saved question through a typed `toStudentCard` function (id, order, title, content, type, options all `isCorrect: false`, media only), so reference answers, explanations, weight and reveal mode never reach the client.
- **Toggle.** A client wrapper holds the view state; the toggle is hidden when the test has no questions.
- **Width.** The page's settings and question section is widened to `max-w-5xl`.

**Behavior 5: Answer-key leak fix.** A student opening a test never receives correct answers for unanswered questions, regardless of test settings.
- **Answer forms get key-free options.** The unanswered card and redo forms always receive options with `isCorrect: false`.
- **Answered views unchanged.** Answered and graded views keep real options and reveal them only through the existing reveal gate.
- **Why it mattered.** Default test settings open the reveal gate before any answer, so the flags were in the client payload.

**Behavior 6: Login pages read the real session.** The login pages previously always saw a signed-out visitor because Next's read-only `headers()` made the session lookup return nothing.
- **Role-less session.** A signed-in user with no teacher or student record sees "Account Not Set Up" instead of the sign-in form.
- **Signed-in admin or student.** Opening a login page redirects to their own dashboard (an admin must log out before signing in as a student in the same browser).
- **Fix.** The session lookup now copies the headers into a plain `Headers` object first.

**Behavior 7: Google join fix.** A Google-created student on a course invite link gets "waiting for admin approval" or the username step instead of looping back to the join card.
- **Same root cause.** `resolveUnclassifiedIdentity` passed the read-only headers straight to the session lookup.
- **One private helper.** `lookupSession` in `src/lib/auth-service.ts` copies the headers and is used by `getSession`, `resolveLoginEntryState` and `resolveUnclassifiedIdentity`.

## Architecture and Design

**Shared student components** (`src/components/`): presentation only, no student server actions.
- **`StudentQuestionCard`:** one question as a student sees it (title, content, media, children slot for controls).
- **`StudentAnswerControls`:** radio or checkbox for multiple choice (radio names are per question), textarea for free text, photo picker for image answers (input id per question).
- **`StudentViewToggle`:** controlled Teacher/Student switch with the two list slots.
- **`StudentViewList`:** the numbered student-view list with throwaway local answer state.

**Answer controls are controlled by the parent.** The student `AnswerForm` wraps them with saving; the preview wraps them with local state only. The preview photo picker validates locally and never uploads.

**Photo validation.** `src/lib/answer-photo-validation.ts` holds one pure validator (`validateAnswerPhotos`: type, 10 MB size, max 3 photos) with its constants in `src/lib/answer-photo-rules.ts`. The student picker and the preview picker both call it, so messages are identical.

**Width and layout.** The Student view list reproduces the student page's `max-w-5xl p-6` box inside a `-mx-6` region that cancels the host page's own `p-6`, so content width equals the student page at every window size.

## Key Decisions

- **D11, D12 (user).** Preview on both the import screen and the test page, via one shared card and two adapters; toggle above the whole list rather than a per-question dialog or separate page.
- **D13 (user).** Preview answer controls are clickable but save nothing and have no Submit button.
- **D15, D21.** Shared card and controls extracted so one markup source keeps the preview faithful; controls are presentational and controlled, and the student photo picker stays on the student side because it imports a student server action.
- **D16 (user confirmed).** Teacher list stays mounted but hidden in Student view so a flip never drops an open edit.
- **D17.** Add-mode numbering continues after the highest live question number, not the question count.
- **D20 (supersedes D18).** The test page maps saved questions to a narrow student card type instead of scrubbing whole questions.
- **D22, D35, D39 (user).** Student view matches the student page's column width; D39 replaced D35's stacked-padding approach with the student page's own box and padding.
- **D23, D33, D36 (user).** Rejection reason shows under the Import button in Student view, led by the card's own label; empty title drops the colon.
- **D24 (user).** Answer-key leak fixed here because the shared card moved the same code.
- **D25, D26.** `/redirect` expires every proxy-accepted cookie name and does not catch lookup errors.
- **D27, D31.** Import numbering uses questions loaded at screen open; a new file resets to Teacher view via a key on the review screen.
- **D28 (user).** Pre-existing picture work committed first (2f98ecc), then one commit per behavior.
- **D30.** Numbering is per-card `order`; there is no list-level first-number prop.
- **D34, D40.** Photo checks shared in `src/lib/`; constants moved there to respect layering.
- **D37, D38 (user).** Login-page and Google-join session bugs fixed in this work with one private helper.
- **D41.** Photo size boundary test added after mutation testing; the import adapter's `isCorrect` mutant accepted as equivalent.

## Test and Quality Status

**Final results**
- **Vitest:** 175 files, 823 tests pass.
- **Playwright:** 86 of 86 pass on a fresh build directory (a stale reused build directory had hung one unrelated pool spec).
- **Biome:** `biome check src e2e` clean; `pnpm lint` fails only on non-source files (`.ai-rules.json`, `.claude/`, `tsconfig.json` drift).
- **tsc:** clean.

**Mutation testing**
- **Budget:** 20 mutants over answer-key hiding, `/redirect` sign-out, numbering, and the other behaviors.
- **Result:** 18 killed, 2 survived: one real (photo size `>` vs `>=` boundary, fixed with an exactly-10 MB test) and one equivalent (draft adapter `isCorrect`, never rendered).

**Test strategy**
- **Test first, one at a time.** Pins of existing behavior started green because no meaningful red exists for them.
- **Quality checkpoints.** Four ran, after Behaviors 1-3, 4-5, 6, and 7, each followed by fixes folded into the owning behavior's commit.

## Files Changed

**Shared components and library** (new)
- `src/components/student-question-card.ui.tsx`, `student-answer-controls.ui.tsx`, `student-view-list.ui.tsx`, `student-view-toggle.tsx`
- `src/lib/answer-photo-validation.ts`, `src/lib/answer-photo-rules.ts`

**Auth and redirect**
- `src/app/redirect/route.ts` (new); `src/app/redirect/page.tsx` (deleted, a route handler cannot coexist with it)
- `src/lib/auth-service.ts`: `signOut(headers)` and private `lookupSession`

**Student page** (`src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/`)
- `test-questions-section.tsx`: uses the shared card and controls; passes key-free `editOptions` to answer forms
- `answer-form.tsx`, `answer-image-picker.state.tsx`: wrap the shared controls and call the shared validator

**Admin import screen** (`src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/import-ai/`)
- `page.tsx`: widened; passes the highest existing question number
- `question-preview.ui.tsx`: draft adapter, toggle, rejection reason; `import-ai-form.state.tsx` and `actions.ts`: carry a bare rejection reason

**Admin test page** (same folder, one level up)
- `page.tsx`: `toStudentCard` mapping, conditional toggle, widened; `test-questions-view.tsx` (new): client view-state wrapper

**Tests** (new)
- `e2e/stale-login-landing.test.ts`, `e2e/google-join-landing.test.ts`; `e2e/answer-reveal-flow.test.ts` adjusted so student contexts start signed out
- Vitest suites for the redirect route, shared components, import screen (student view, numbering), test page (student view, payload), and the student page (unanswered card, answer-key hiding)

## Notes

- **Base commit.** 2f98ecc holds the pre-existing picture import work; the seven behaviors are built on top.
- **Pre-existing bugs.** The "Account Not Set Up" state and Google join provisioning already existed but were unreachable because of the read-only-headers bug; Behaviors 6 and 7 make them reachable.
