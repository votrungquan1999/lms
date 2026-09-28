# Visual QA state inventory

One line per `snap()` call. Tiers rank states by how likely they are to hurt someone, not by how many branches the code has: **T1** reachable in normal use, **T2** rare but the user gets stuck, **T3** cosmetic-only, **skip** proven unreachable with the source line that proves it.

Assembled from e2e/visual/states/*.md — edit those, not this file.

# courses

Routes: `src/app/admin/(dashboard)/courses/page.tsx`,
`src/app/admin/(dashboard)/courses/[courseId]/page.tsx`,
`src/app/admin/(dashboard)/courses/[courseId]/results-report/page.tsx`

## Captured

- [T1] courses/list: every course — the seeded one, a long spaced title, an unbroken email-like title, and one with no description (page.tsx:32)
- [T1] courses/create-dialog-blank: the Create Course dialog just opened, both fields empty
- [T2] courses/create-invalid: Create submitted with a whitespace-only title — the action's "Course title is required" alert (actions.ts:11)
- [T1] courses/detail-seeded: seeded course detail — 16 enrolled students, 2 tests with per-status counts, join-link panel, materials
- [T1] courses/detail-empty: a freshly created course — no students, no materials, no tests, no join link yet
- [T1] courses/detail-long-title: detail + breadcrumb of a course whose title is a long name with spaces
- [T1] courses/detail-unbroken-title: detail + breadcrumb of a course titled with one unbroken email-like string, description an unbroken URL
- [T1] courses/enrollments-dialog: Manage Enrollments on the seeded course — 16 students, all pre-ticked, list clipped at max-h-[80vh]
- [T2] courses/enrollments-none-ticked: the same dialog on a course with nobody enrolled — 16 students, none ticked
- [T1] courses/results-report: Export Results for the seeded course — 16 student radios, 2 test checkboxes, Export PDF disabled
- [T1] courses/results-report-selected: one student and one test picked, Export PDF enabled
- [T2] courses/results-report-empty: Export Results for a course with no students and no tests — two headings with nothing under them and a dead Export button

## Not captured

- [skip] courses/list-empty: the "No courses yet" branch (page.tsx:57) needs an empty course collection; the seeded course is shared and must not be deleted
- [skip] courses/create-success: the dialog's success banner (create-course-form.tsx:69) only renders right after a create, so capturing it would add a throwaway course to the shared list on every run
- [skip] courses/detail-not-found: notFound() (\[courseId\]/page.tsx:48) renders Next's built-in 404 — there is no custom not-found.tsx anywhere under src/app, so nothing course-specific to review
- [skip] courses/enrollments-no-students: "No students found" (enroll-student-form.tsx:132) needs zero students in the shared seeded database

## entry (src/app/page.tsx, src/app/redirect/page.tsx, src/app/admin/login/page.tsx, src/app/student/login/page.tsx, src/app/join/[token]/page.tsx, src/app/admin/(dashboard)/dashboard/page.tsx)

- [T1] entry/landing: `/` signed out — the two role cards (Student / Administrator)
- [T1] entry/admin-login: `/admin/login` signed out — Google sign-in card
- [T1] entry/student-login: `/student/login` signed out — username/password card, no errors
- [T1] entry/student-login-empty-submit: Sign In clicked with both fields blank — the browser's own `required` bubble, the app shows nothing of its own (student-login-form.tsx:72,84). Capture is flagged `stable: false` because Chromium's bubble is transient; the image still holds it
- [T2] entry/student-login-blank-username: username `"   "`, password `password123` — the only reachable path to the form's own "Username and password are required" (`required` treats whitespace as filled; student-login-form.tsx:36-37)
- [T2] entry/student-login-wrong-credentials: unknown username + wrong password — "Invalid username or password" (student-login-form.tsx:48)
- [T2] entry/join-invalid-token: `/join/this-token-does-not-exist` — "Invitation no longer valid" card (join-page.ui.tsx:39)
- [T1] entry/join-valid-token: a live invite path read off the seeded course — invite card with the self-signup form and the Google button
- [T2] entry/redirect-logged-out: `/redirect` with no session — **HTTP 500**, not the landing page (see notes)
- [T2] entry/admin-url-logged-out: `/admin/students` opened with no session — lands on `/admin/login`; `/admin/students` is outside proxy.ts's `protectedRoutes` (proxy.ts:5-10), so the dashboard layout's guard does the redirect (page-guard.ts:46-47)
- [T2] entry/admin-url-forbidden: `/admin/students` opened by a signed-in student — the 403 "Access Denied" page (page-guard.ts:49-50 → forbidden.tsx)
- [T1] entry/admin-dashboard: admin overview with the Students / Courses / Grading stat cards
- [skip] entry/redirect-logged-in: unreachable as a screen — every branch of RedirectPage calls `redirect()` and it returns no JSX (redirect/page.tsx:28-41); signed in as admin it just lands on `/admin/dashboard`, already captured above
- [skip] entry/admin-login-unclassified: needs a real Google OAuth round trip to mint a session with no admin/student record (admin/login/page.tsx:37-38); not drivable offline
- [skip] entry/join-google-*: `?google=1` provisioning branches need a completed Google OAuth callback (join/[token]/page.tsx:76-88); not drivable offline

## grading (src/app/admin/(dashboard)/grading/page.tsx, grading/[testId]/page.tsx, courses/[courseId]/tests/[testId]/grading/page.tsx)

- [T1] grading/hub-needs-grading: hub on its default filter — one test card with an ungraded count
- [T1] grading/hub-all-tests: hub on the All filter — every test in the database (many items)
- [T1] grading/hub-no-match: Fully graded filter matches nothing, "No tests match."
- [T1] grading/roster-all-students: /admin/grading/seed-test-visible as a grader lands on it — 16 enrolled students in the roster, long names, first student auto-focused
- [T1] grading/student-not-started: alice focused — no answers, every question reads "No answer submitted"
- [T1] grading/student-in-progress: bob focused — one free-text answer, grade form open, test not submitted
- [T2] grading/grade-in-progress-confirm: "Submit grade anyway?" guard dialog after pressing Save Grade on bob (grading too early); Submit Anyway is never clicked
- [T1] grading/student-blank-free-text: dan focused — submitted with the free-text left blank (the MC answers are auto-graded, so the roster badge reads Graded 2/2)
- [T1] grading/student-graded: frank focused — every question scored, feedback filled in
- [T1] grading/student-redo-requested: ivy focused — the Request Redo control replaced by "Redo requested ↩"
- [T1] grading/student-ai-suggestion: noah focused — AI suggestion panel with score, model, suggested solution, Apply and Regenerate
- [T1] grading/by-question-all-students: ?mode=question — question roster on the left, one grading row per enrolled student on the right (many items)
- [T1] grading/course-scoped-unreleased: /admin/courses/.../tests/seed-test-hidden/grading — Release Grades + Release Correct Answers both unreleased, 16 not-started students
- [T1] grading/empty-roster-unbroken-title: a fresh "[grading]" course and test — 0 students ("No students enrolled in this course yet."), title pasted as one unbroken email-like string, long course name
- [T3] grading/grades-released: the same page after Release Grades — the control is simply gone, with no confirmation anywhere

- [skip] grading/hub-all-caught-up: "All caught up." needs zero tests holding a Submitted student; the seed keeps nine on seed-test-visible (page.tsx:133, 170-172)
- [skip] grading/release-grades-success: the "Grades released ✓" message (grading-forms.tsx:481-484) cannot be photographed — the action revalidates the route and the header drops the whole button (grading/[testId]/page.tsx:82-86) before the client success state paints; captured grading/grades-released instead
- [skip] grading/per-student-release: "Release Grade to Student" needs grades withheld AND a fully graded submission; seed-test-visible shows grades immediately and seed-test-hidden has no submissions (release-grade-for-student.tsx:57-61)
- [skip] grading/ai-auto-grade-result: "Auto-grade with AI" posts to the real model (auto-grade-with-ai-button.tsx:62-68) — not mocked here, so it is never clicked
- [skip] grading/image-answer-annotation: neither seeded test has an image_answer question, so the annotation branch never renders (seed-test-states.ts ensureQuestions adds free_text + two MC only)
- [T3, not captured] grading/by-question-empty: "No questions on this test yet." on the sandbox test — left out for budget, the page is otherwise identical to grading/empty-roster-unbroken-title

## people — students (src/app/admin/(dashboard)/students/page.tsx, create-student-dialog.tsx)

- [T1] people/students-list-seeded: 16 accounts in the card grid — the many-items case, with several very long seeded names ("Hank Submitted (MC autograded, free-text pending)")
- [T1] people/create-dialog-blank: Create Student dialog just opened, all three fields empty
- [T1] people/create-submitted-empty: Create Student clicked with every field blank — native `required` blocks the post, so the only feedback is Chromium's own bubble (page.tsx has no client-side error copy)
- [T2] people/create-blank-error: fields filled with spaces only (passes `required` + `minLength`), so the server's "All fields are required" refusal renders in the dialog (actions.ts:44)
- [T1] people/create-duplicate-username: username `alice` (a seeded account) — "Username already exists" (auth-service.ts:139)
- [T1] people/create-success-countdown: success banner plus the auto-close countdown, held at its first value by the frozen clock (create-student-dialog.tsx:110)
- [T1] people/students-long-name: list containing a 71-char full name with spaces (`people-longname`)
- [T1] people/students-unbroken-name: list containing an unbroken email-like name and a 48-char unbroken username (`people-khoahoccoban2026.student.university.edu.vn`)

## people — user roles (src/app/admin/(dashboard)/user-roles/page.tsx, role-action-buttons.tsx)

- [T1] people/user-roles-list: every account that can sign in, with role badge and the grant/revoke control; includes both stress names and their derived `@lms.internal` emails
- [T2] people/user-roles-self-revoke-error: owner clicks "Revoke admin" on their own row — refused inline by the self-demotion guard (actions.ts:142)

## people — join requests (src/app/admin/(dashboard)/join-requests/page.tsx)

- [T1] people/join-requests-caught-up: Waiting tab with nothing seeded — the "All caught up." empty state, pagination hidden
- [T3] people/join-requests-approved-empty: Approved tab — the neutral "No requests match." empty state (a different string from the same page)

## Not captured

- [skip] people/user-roles-truncated: the "Showing first {limit} of {totalCount}" banner needs 101 sign-in accounts; the bound is a constant, not a UI control (user-role-service.ts:30)
- [skip] people/join-requests-rows / pagination: no join request is seeded and nothing on the admin side can create one — a request is only born from the student-side join flow
- [T3, not captured] granting admin to another account: the action really writes to the shared database, so it is not safe to drive from a tour

## pools (src/app/admin/(dashboard)/pools/page.tsx, src/app/admin/(dashboard)/pools/[poolId]/page.tsx)

Every row this tour creates is prefixed `[pools] `, and `resetOwnFixtures()` deletes exactly those rows before the run — otherwise the empty bank is only capturable once.

### Pools list — /admin/pools

- [T1] pools/list-empty: no pools at all, the "No pools yet" placeholder (page.tsx:74-78)
- [T1] pools/list-one: one pool, "1 pool" / "0 questions" singular counts (page.tsx:39, 58-60)
- [T1] pools/list-many: three pools — a normal name, a long spaced name, an unbroken email-like name — with 3 / 1 / 0 question counts, and one pool with no description (page.tsx:45-72)
- [T1] pools/create-dialog-blank: Create Pool dialog just opened, both fields empty (create-pool-form.tsx:41-67)
- [T2] pools/create-dialog-success: green success banner inside the still-open dialog after a pool is created (create-pool-form.tsx:69-73)

### Pool detail — /admin/pools/[poolId]

- [T1] pools/detail-empty: pool created seconds ago, "0 questions", only the blank Free Text add form ([poolId]/page.tsx:50-86)
- [T1] pools/detail-many-questions: one question of each type, each with its always-expanded edit panel ([poolId]/page.tsx:55-84, pool-question-edit.state.tsx)
- [T1] pools/detail-long-name: pool name is a long Vietnamese phrase with spaces — wraps in the h1 and in the breadcrumb ([poolId]/page.tsx:44, @breadcrumb/pools/[poolId]/page.tsx:35)
- [T1] pools/detail-unbroken-name: pool name is one unbroken email-like string — page scroll width exceeds the viewport here

### Add-question form — /admin/pools/[poolId]

- [T1] pools/add-free-text-filled: Free Text filled, model answer + explanation + an answer-display radio picked (add-pool-question-form.tsx:257-304)
- [T1] pools/add-single-select-filled: Single Select with 3 options, one radio marked correct, remove ✕ buttons showing (add-pool-question-form.tsx:189-243)
- [T1] pools/add-multi-select-filled: Multi Select with 3 options, two checkboxes marked correct
- [T1] pools/add-question-success: immediately after a successful submit — "Question added to pool" banner on screen, form reset, question list revalidated (add-pool-question-form.tsx:317-321)
- [T2] pools/add-question-error: title submitted as whitespace, server validation alert on screen (add-pool-question-form.tsx:323-330, pool-question.schema.ts:20)

### Compose into a test — /admin/courses/[courseId]/tests/[testId]

- [T1] pools/compose-panel-selected: "Add from Pools" panel listing all three pools, one checked with a draw count of 2, the other rows' count inputs disabled (compose-from-pools-form.tsx:130-178)
- [T1] pools/compose-success: "Added 2 questions from pools" banner with the drawn copies now in the test's question list (compose-from-pools-form.tsx:185-189)

### Not captured

- [skip] pools/delete-pool: no UI reaches it — `deletePoolAction` (pools/actions.ts:135) is imported by no component, so a pool cannot be removed from the app at all
- [skip] pools/unauthorized: the error branch needs a non-admin session (actions.ts:44, pool-question-actions.ts:39); the whole admin area is admin-gated, so an admin tour cannot render it
- [skip] pools/creating-pending: the "Creating…"/"Adding…" disabled button (create-pool-form.tsx:65, add-pool-question-form.tsx:312) lasts only as long as the server action; holding it needs request interception, which cannot fake a server action reliably
- [T3] pools/not-found: an unknown poolId renders the generic 404 ([poolId]/page.tsx:34-36) — reachable by editing the URL, but it is the app-wide 404, not a pools screen

## student (src/app/student/(dashboard)/…)

Tour: `e2e/visual/student.tour.ts`. Runs as `visual-student` (Nguyen Thi Phuong Thao),
enrolled in `seed-course-fundamentals`.

`seed-test-visible` is never written to — every pre-submit state on it is reached with
client-only input (typing, ticking, opening the confirm dialog), so it captures the same
on the first run and the tenth. The states that need real writes run against
`[student] Timed drill`, a scratch timed test the tour creates and deletes each run.
`seed-test-hidden` is submitted once and stays submitted; that end state re-renders
identically, so the tour skips the answering steps when it is already there.

### Dashboard and course detail

- [T1] student/dashboard-one-course: one enrolled course, the four summary tiles, graded-progress bar
- [T1] student/course-tests-list: course detail listing its tests with per-test status badges (includes the long-title scratch test the `tests` tour leaves behind)

### Taking a test (seed-test-visible, 3 questions, untouched)

- [T1] student/test-not-started: first open — 0 / 3 answered, all three question types in their empty input form (textarea, radios, checkboxes)
- [T1] student/free-text-long-typed: a long answer with spaces plus one unbroken 145-char address typed into the textarea — does the fixed 5-row box grow, does the token overflow
- [T1] student/mc-options-selected: single-select radio picked and two multi-select boxes ticked, nothing saved yet
- [T1] student/submit-confirm-unanswered: the submit dialog one tap away from a blank submission — "0 out of 3 … 3 questions unanswered"

### The timed scratch test (created, driven and deleted by this tour)

- [T2] student/timed-start-gate: the Start gate a timed test shows before the student begins
- [T1] student/timed-countdown: exam screen after Start — live countdown above the question. **The number is a capture artifact**: the browser clock is frozen at 2026-09-23T10:00:00Z while the server stamps `startedAt` from the real clock, so the displayed value is (startedAt + 1500 min − frozen clock), ~500 minutes. The 1500-minute limit is deliberate — anything shorter renders a flat 00:00 under the frozen clock. What is real in this shot is the `mm:ss` format never rolling over into hours (countdown.state.tsx:18-22)
- [T1] student/answer-saved-readonly: one answer saved — read-only view with Edit Answer, 1 / 1 answered, and the unbroken token running off the right edge of the card
- [T1] student/submit-confirm-all-answered: the submit dialog's other branch — "You have answered all 1 question"
- [T1] student/submitted-waiting: straight after Confirm Submission — answer shown read-only, "waiting to be graded", Back to Course

### Result visibility off

- [T1] student/hidden-test-submitted: `seed-test-hidden` after submitting, with every reveal switch off — free-text answer echoed back, and each MC selection rendered as a chip with the answer key scrubbed out

### Not captured

- [skip] student/image-answer: the image-answer question type is real (answer-form.tsx:212-254) but no seeded question uses it — the seed only authors free_text / single_select / multi_select (scripts/seed-test-states.ts:387-409). Reaching it means authoring an image question and uploading a photo through S3
- [skip] student/graded-question: the graded read-only card (graded-question.tsx) needs an admin to grade this student's submission first; the grading tour owns that flow
- [skip] student/redo-banner: the "Redo Required" banner needs an admin redo request against this student (page.tsx:258-266)
- [skip] student/practice-reveal: the Practice Reveal panel needs `isPractice` on the test (test-questions-section.tsx:227-289); practice and a time limit are mutually exclusive, so it cannot share the scratch test

## tests (src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/page.tsx, .../import-ai/page.tsx)

- [T1] tests/detail-empty: brand-new test created through the UI, zero questions — "No questions yet" plus the whole authoring column; its h1 is the long name with spaces
- [T1] tests/add-free-text-filled: Add Question on Free Text, every field filled (title, 15-row markdown body, model answer, explanation, per-question reveal radio)
- [T1] tests/add-single-select-filled: Add Question on Single Select, 3 option rows (one an unbroken email-like string, one long with spaces), radio marking the correct one, explanation filled
- [T1] tests/add-multi-select-filled: Add Question on Multi Select, 3 option rows, two checkboxes ticked, explanation filled
- [T1] tests/add-many-options: Multi Select grown to 7 option rows via "+ Add Option", mixed short/long/unbroken texts, remove (✕) buttons on every row
- [T2] tests/add-validation-error: submitted with a whitespace-only title — the server rejection "Question title is required" is on screen
- [T1] tests/add-success-banner: the moment after a successful submit — green "Question … added successfully" banner on screen, form remounted blank
- [T1] tests/unbroken-question: a question whose title and body are one pasted email-like string, rendered in the question list, the header count, and the success banner
- [T1] tests/settings-practice-saved: Test Settings with Practice ticked and saved — "Settings saved", time-limit input disabled with its alternate helper text
- [T1] tests/detail-seeded: seed-test-visible with its 3 questions (free_text, single_select, multi_select), answered-student counts, and every inline edit panel expanded
- [T1] tests/import-ai-initial: the AI import page before any file is chosen (picker only; the review list renders nothing)
- [T2] tests/import-ai-review: after a real PDF upload — the mocked provider's canned single free-response draft, APPEND/REPLACE selector, and Import button

Not captured:

- [skip] tests/add-grading-strategy: no grading-strategy control exists to photograph. `mcGradingStrategy` is schema-only on this form (test-question.schema.ts:47-49) and always lands as the default (actions.ts:265); question-list.tsx:147-151 only *displays* it. Nothing in src/ renders a control for it.
- [T3] tests/add-image-answer: the 4th sidebar type is reachable, but its panel is a strict subset of the free-text panel (title + body + media, add-question-form.tsx:282-335) — dropped to stay inside the state budget.
- [T2] tests/edit-confirm-dialog: the "Confirm your change" gate (question-edit.state.tsx:513-538) only renders when a question already has answers, i.e. only on seeded questions. Driving Save there would write to shared seeded rows if the gate ever misfired, so it is left to a tour that owns its own answered data.

