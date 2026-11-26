# Revamp stage 1: teacher shell, To grade, course tabs

Living spec for stage 1 of the LMS revamp. It describes the code on branch `feat/revamp-stage-1` (20 behavior commits on base `34184dcc`, not pushed, no PR yet).

- Decision numbers (D1-D44) come from the stage decision log (workspace `tmp/revamp-stage-1/DECISIONS.md`, not committed; also tracked on AI-Kanban card #602). D32 is replaced by D33. D-B19-1 and D-B20-1 are D36 and D37.
- "Teacher" in the UI is the admin role in code.
- Stage 1 changes the teacher side only: the sidebar and school header, To grade, the Courses list, the course page tabs, the New course dialog, Export results, and the sidebar counts. Student pages, the grading pages' behavior and the release rules are unchanged, except where a behavior below says otherwise.

## Status

- All 20 behaviors done, one commit each (see [Commits](#commits)).
- Final check after the last fix round: see [Verification](#verification).
- Open items are listed at the end under [Open items](#open-items).

## Behaviors

### 1. Teacher sidebar entries

- The sidebar lists To grade, Courses, Question bank, Students and Join requests, in that order.
- Dashboard and the "Need actions" group are gone. The logo links to To grade; with 2 or more schools the whole header opens the school switcher instead (on a tablet it is the rail's top tile).
- The Owner section (User roles, Schools) shows only to owners. Owner pages keep their own owner-only guard.

### 2. School name at the top, Sign out at the bottom

- The school name sits at the top of the sidebar. With two or more schools, it is a switcher there. With one school, it is a plain name with no chevron.
- On a tablet the switcher is the top tile of the icon rail. The avatar menu holds the email and Sign out only (D20).
- The email and Sign out sit at the bottom of the sidebar.
- Sign out and switching school both ask "Leave this page?" first when a page has unsaved work. This covers both Sign out buttons: the sidebar one (also used in the phone sheet) and the rail avatar menu item.
- A school-less admin sees no badges and makes no counts request. School pages send them to the no-school page; the owner pages (User roles, Schools) still open for an owner.

### 3. Current page and breadcrumb

- The sidebar highlights the current page by address. `/admin/courses/<id>/tests/<testId>/grading` highlights Courses; `/admin/grading/<testId>` highlights To grade. Exactly one entry is highlighted.
- Nested pages show a breadcrumb inside the page content, above the title. The layout renders the existing breadcrumb slot there (D10).
- Top-level pages keep their breadcrumb slot entries as pages that render nothing, so a client navigation never shows a stale trail (D23).

### 4. Teacher lands on To grade

- Every sign-in path, and every school switch, lands on `/admin/grading` (To grade).
- The old `/admin/dashboard` address redirects to `/admin/grading` (D9). The old `?filter=` query is ignored.

### 5. To grade lists the tests with work waiting

- Tests are grouped by course. The group header reads "<course> · n waiting · n tests".
- Courses, and the tests inside each course, are ordered by their oldest waiting hand-in, oldest first.
- Each test row shows its waiting count, the oldest waiting student, and "Continue grading" and "By question" actions. "Continue grading" opens `/admin/grading/<testId>`; "By question" adds `?mode=question`.
- The test title links to the course test page.
- The oldest hand-in reads "today", "yesterday" or "n days ago", counting whole elapsed 24-hour periods (D18).
- Practice tests never count as waiting (D5).
- The old Partially, Fully and All views are gone. To grade shows "Needs grading" plus the "Graded, not released" section (D2).

### 6. "Graded, not released" group

- A test sits here when nothing waits and at least one graded student cannot see their grade yet.
- The section is collapsed and shows at 0 with "Nothing to release" (D19).
- A partly released test stays here with "Released to x of y".
- Its button reads "Release" through a label prop. The grading pages keep "Release Grades" (D19).
- Practice tests never sit here (D5).
- Courses, and the tests inside each course, are ordered by title, then id, so the group does not reshuffle as grades come in.
- Release sets the release time for the test only. It does not change any answer.
- The section note reads "Students can't see these grades until you release them." when the section has tests.
- With no tests in the section, the heading reads "Graded, not released (0)" with "Nothing to release." below it, and the note reads "Nothing to release yet." when some non-practice test still has a grade a student cannot see (its test still has work waiting), and "Students can see every grade you have given." only when every grade is visible.

### 7. All caught up

- When nothing waits, To grade shows "All caught up" with a link to Courses.
- The "Graded, not released" section still renders below it when it has tests.

### 8. To grade sidebar badge

- The To grade badge shows the number of submissions waiting in the school. It is hidden at 0 (D22 for the full number).
- On the folded rail the badge caps at "99+". The tooltip and screen-reader label keep the full number (D39).
- The badge refreshes on every path change from a read-only route, `GET /api/admin/sidebar-counts` (D3, D7).
- A change that only alters the query string (search params) does not refetch (D41).
- It also refreshes after the teacher's own grading, release, redo, join-request and enrolment actions, which re-render the layout.
- The count is read-only. It reproduces the hand-in rule for expired timed attempts and does not write to the database (D6).
- If the badge counts fail, the admin pages still render with no badges. The error is logged, and the client refetch on path change keeps working.
- A student with an open redo request still counts as waiting while their old hand-in has ungraded answers (D40).

### 9. Join requests badge

- The Join requests badge shows the same number as the Join requests list.
- Both use one visibility rule, kept in the join-request service (D24).
- The badge is neutral grey; the To grade badge is amber (D28).
- The badge updates after approving or rejecting.

### 10. Sidebar fold and phone sheet

- The fold button, named "Collapse sidebar" / "Expand sidebar", shows on tablet and desktop (D12, D27). A teacher's own fold or expand lasts only until the screen crosses a breakpoint, then the size's default returns. The canvas boards show the same button (published as canvas Version 29, 52 teacher boards).
- Tablet (768-1279 px): the sidebar folds to an icon rail with tooltips, badges and the avatar menu.
- Desktop (1280 px and up): the sidebar is open by default.
- On a tablet, the fold does not animate on a full page load; the animation runs only for a fold or expand the teacher triggers (D29).
- Phone (below 768 px): a sticky top bar with a menu button opens the sidebar as a slide-out sheet. The sheet has a Close button.
- The sheet closes when a sidebar entry or the header logo link is tapped, including the entry for the page already open, and when a school is picked in the switcher (after the "Leave this page?" guard is answered). It does not close on browser Back.

### 11. Courses list

- Each course is a row. Rows are ordered most waiting first, then newest created, then id (D17).
- The meta line names the tests that need work, for example "<test> has n submission(s) waiting · <test> graded, not released". With no such test it reads "No tests yet" or "Nothing submitted yet", or lists the test titles.
- The course description is no longer shown in the list (D17). The course page header still shows it.
- A pill reads "n waiting" (or "Nothing waiting"). On desktop it sits in its own column; on a phone it shows under the counts line (D41).
- The row action reads "Grade" when something waits, otherwise "Open". Both link to the course page, which is the Tests tab.

### 12. New course

- "New course" opens the existing dialog (D4), with a required title and an optional description.
- The title error "Course title is required" is announced to screen readers with role "alert" (D33).
- A school with no courses sees a first-run page with the same button.

### 13. Course page tabs and header

- Three tabs, each its own URL: Tests (`/admin/courses/<id>`), Students (`/students`), Materials (`/materials`). Old links and Back keep working.
- Each tab page, and Export results, checks for itself that the course belongs to the session's school and shows not-found otherwise. A not-found in the layout would not stop its pages from rendering.
- A shared header on all three tabs shows the course title, "n students · n tests", the course description when there is one, Export results and New test (D8).
- On a phone, Export results and New test sit below the title (D38).
- Test and grading pages stay outside the tab group.

### 14. Tests tab: Needs your action

- Lists tests whose action is Grade (something waits) or Release (graded and hidden) (D31).
- A test with both waiting and hidden grades shows once, with Grade.
- The section is hidden when empty (D22).
- "Students see" reads: practice shows "Answers as they go"; nothing submitted shows "Nothing yet"; a test that shows grades on submit shows "Shown on submit"; a test released as a whole (Release Grades on the test) shows "Released"; when some or all graded students were released one by one it shows "Released to x of y", even if x equals y; otherwise "Not released" (D31).

### 15. Tests tab: All tests

- Every live test, newest first, with id as the tie-break.
- Columns: Submitted, Grading, Students see, and one action. Deleting a test stays on the test page.
- Search matches test titles and ignores accents and case (D14).
- Filter chips: All, Needs grading, Not released, Practice. One chip at a time. Chip counts are whole-course and do not follow the search (D30).
- Chips and search apply together.
- "Released to x of y" rows appear in All only (D30).
- The header stays pinned while scrolling.
- Empty states: "No tests yet." and "No tests match".

### 16. Students tab: enrolled students

- Rows sort by name, then id (D34). Each row shows name, @username and joined date in Vietnam time (D15).
- The search box appears only when someone is enrolled. It matches name or @username and ignores accents and case (D14, D34).
- Remove asks "Remove <name> from this course?" and then removes only that student's enrolment. The account stays. A failure shows inline in the row (D34).
- "Add students" opens the existing enrolment dialog, with the trigger renamed. The dialog keeps its heading and "Confirm Enrollments" (D21).
- Note: in that dialog, unticking an enrolled student removes them, so a teacher who unticks a student by mistake removes them (D21, accepted).

### 17. Students tab: pending join requests

- The card lists this course's pending join requests, oldest first, with Approve and Reject.
- The card is hidden when there are none (D22).

### 18. Students tab: join link

- Shows Copy, Regenerate link and Turn off link, or Get join link when no link exists.
- The link path stays in a `<code>` element (D21).
- Regenerate and Turn off act on one click with no confirm, as today (D21).

### 19. Materials tab

- A File / Size / Uploaded table with a Download link per file. "No materials yet." when empty.
- Sizes read "229 B", "1.2 KB", "15 MB" (base 1024, one decimal below 10 of a unit) (D36). Formatting happens on the server.
- Dates are in Vietnam time (D15).
- On a phone, each row stacks: file name, then size and date, then Download and Remove (D38).
- Adding, downloading and removing work as today.

### 20. Export results

- Export results sits in the course header and opens a page where the teacher picks one student and one or more tests.
- The page follows the board: numbered "Student" and "Tests" cards, @username on each student row, tests in two columns from large widths.
- Export PDF stays disabled until a student and at least one test are picked.
- With no students enrolled, "No students enrolled yet" links to the course's Students tab, where students are added.
- The note names the picked student ("One PDF for <name> …"). With no student picked it reads "the student you pick" (D37).
- Students are listed by name, then id (fixed after verification, D41).
- The download route is unchanged.

## Access

- `GET /api/admin/sidebar-counts` needs a school-admin session and answers 401 without one. It sends `Cache-Control: no-store`.
- The proxy does not cover `/api/*`, so the route's own `requireAdminSession` check is its only auth gate.
- Each course tab page and Export results check the course belongs to the school themselves (see Behavior 13).

## Data rules

- Two new plain indexes on the `answer` and `grade` collections by `{testId, studentId}`. They speed up the sidebar and To grade counts (D16).
- The two indexes build tolerantly. A failed build is logged, the app keeps running, and the build is retried on the next server start (D16). The first request after deploy still waits for the index setup.
- Live-data note: the two indexes build once on the live database at the first start after deploy.

## Key files

- Sidebar and layout: `src/app/admin/(dashboard)/admin-sidebar.tsx`, `admin-sidebar-provider.tsx`, `admin-school-header.tsx`, `layout.tsx`.
- Counts: `src/lib/grading-count-service.ts` (read-only school count), `src/lib/school-grading-counts.ts` and `src/lib/school-sidebar-counts.ts` (React `cache()` wrappers: one run per server render, keyed by school id, not shared across requests), `src/app/api/admin/sidebar-counts/` (read-only route), `src/app/admin/(dashboard)/sidebar-counts.state.tsx` (refetch on path change).
- Join requests: `src/lib/course-join-request-service.ts` (`listVisibleByStatus`, `countVisiblePending`).
- To grade: `src/app/admin/(dashboard)/grading/` (page and `to-grade-groups.ts`).
- Courses: `src/app/admin/(dashboard)/courses/courses-list.ui.tsx`.
- Course tabs: `src/app/admin/(dashboard)/courses/[courseId]/(tabs)/` (layout, Tests, `students-list.ui.tsx`, `materials`).
- Export results: `src/app/admin/(dashboard)/courses/[courseId]/results-report/page.tsx`.
- Indexes: `src/lib/database.ts`.
- E2E helpers: `e2e/own-school.ts` (creates an own school for count specs, D11); `e2e/admin-account.ts` (exports only `ADMIN_EMAIL`).

## Commits

One commit per behavior, subjects as written in `COMMIT_PLAN.md`. No co-author trailers.

- 1 `40a8773a` sidebar entries
- 2 `bf6b2e00` school name at the top, Sign out at the bottom
- 3 `cc6ea493` current page and breadcrumb
- 4 `a692eba5` teacher lands on To grade
- 5 `4b89bb51` To grade lists waiting tests
- 6 `74694dbc` "Graded, not released" group
- 7 `7b024bae` "All caught up"
- 8 `e0feb59f` To grade sidebar badge
- 9 `83b7ca27` Join requests badge
- 10 `4eb0e903` sidebar fold and phone sheet
- 11 `9a665aeb` Courses list
- 12 `47be1248` New course and first-run page
- 13 `de60cf93` course page tabs and header
- 14 `f3304435` Tests tab: Needs your action
- 15 `c6a61dc0` Tests tab: All tests
- 16 `97a76a24` Students tab: enrolled students
- 17 `697846b1` Students tab: pending join requests
- 18 `f2ce067c` Students tab: join link
- 19 `17008877` Materials tab
- 20 `b8a1b08d` Export results page

The per-behavior count matches: 20 commits on top of base `34184dcc`, 20 behaviors done.

## Verification

- Quality checkpoints: seven, after behaviors 1-3, 4-6, 7-9, 10-12, 13-15, 16-18 and 19-20. Findings were fixed and folded into their behavior commits; re-checks followed (`IMPLEMENTATION_PROGRESS.md`).
- Conformance: a validation note exists for each behavior (`VALIDATION_STEP_1.md` to `VALIDATION_STEP_20.md`). All 20 behaviors were judged to match the plan.
- Adversarial revalidation: about 57 risk entries were checked by code reading (`ADVERSARIAL_REVALIDATION.md`).
  - One break, fixed: the phone sheet stayed open after navigation (D41).
  - Low silent-misbehavior notes and their outcomes: the Courses phone pill (fixed, D41); the redo-open waiting count (kept by owner decision, D40); "Add students" can remove by unticking (accepted, D21).
  - Low notes kept as is: the rail badge capped at "99+" (D39) and To grade (oldest hand-in first) and Courses (most waiting first) order differently on purpose (D17).
- Mutation pass: 30 mutants. First pass: 20 killed, 10 survived (`MUTATION_RESULTS.md`). The 10 survivors were all covered by new tests-only additions in behaviors 6 and 8 (`MUTATION_SURVIVOR_FIXES.md`), then all 10 were re-run and killed (`MUTATION_RESULTS_RERUN.md`).
  - The survivors were in the count service (`grading-count-service.ts`), the release-group order (`to-grade-groups.ts`) and the stale-fetch guard (`sidebar-counts.state.tsx`).
- Final check, after verification fixes and the mutation test additions:
  - `pnpm lint` (771 files) and `npx tsc --noEmit`: clean.
  - `pnpm test` (vitest, real local Mongo): 2118 of 2119 tests pass. One test, `page-timed-gate.test.tsx`, hit the 5 s timeout under full-suite load and passed 10 of 10 when its file ran alone.
  - `pnpm test:e2e` with a clean dist dir: 172 of 172 pass.
- Visual tours: an earlier run, before the verification fixes, gave 43 pass, 5 fail and 29 not run on the desktop project (`IMPLEMENTATION_PROGRESS.md`, Final check). The tours were not re-run in the last final check. See [Open items](#open-items).
- No tests were re-run for this spec.

## Open items

- **Visual tours, pre-existing wording failures (4).** The grading tour expects "No answer submitted" (the page shows "No answer - scored N"). The student tour expects "0 / 3 questions answered" (the page shows "0 / 3 answered"). The pools and tests tours look for the radio "Compare side by side" (the UI says "Side-by-side comparison"). These strings predate this branch.
- **Visual tours, `/redirect` step.** The entry tour expects a 500 from `/redirect`, which now returns 200. Pre-existing.
- **Visual tours, unchecked steps.** Each failing tour stops at its first failure, so 29 later tour steps were not run in that earlier run.
- **Dev-only hydration mismatch.** On admin pages, Radix generated ids differ between server and client on same-tab reloads in dev. It is present on base `34184dcc` too. A production build of HEAD showed no mismatches in 24 loads. Not fixed.
- **Export student id tie-break is untested.** Students with the same name are ordered by id, but no test pins it. Test ids cannot be chosen in the test database.
- **Phone Materials table roles in Safari.** Below the phone width the Materials `<table>` is `display: block`, which in Safari may drop table roles for screen readers. Judged and left as is, because the phone layout is the D38 decision.
- **Approve and Reject buttons share names.** Each row's buttons are named just "Approve" and "Reject", so they are not told apart by name. Scope them by row.
- **`CourseJoinRequestService.listByStatus` has no production caller.** Kept because eight test call sites use it (D35).
- **Two new indexes build on the live database** at the first start after deploy. The build is tolerant (see [Data rules](#data-rules)).
- **No fallback for count query cost.** Every admin render now runs lookups on `question`, `test_submission`, `test_start`, `redo_request` and student-by-id that have no usable index, across all schools.
- **The count runs twice on To grade, Courses and Tests.** The page render counts, then the badge refetch on the path change counts again.
- **Status and visibility rules are copied.** The count service and the Tests tab rows repeat the test-status rule and the "can the student see the grade" rule from their services, so a release-rule change in stage 2 must be made in all copies.
- **The Not released chip matches pill text.** The chip is decided by comparing the pill's display text, so rewording the pill empties the chip.
- **Hand-typed tab URLs and question-type lists.** The Students and Materials tab paths are string literals in many places, and the four question types are listed by hand in three places.
- **Test gaps.** The sidebar-counts route test cannot catch counts read for the wrong school (its stubs ignore the school id). The school-less admin has no layout-level test. "Students see" on the Tests tab has no unit test for three of its branches.
- **`$group` memory limit on the free tier.** On the free MongoDB tier, the answer `$group` could fail for one school with hundreds of thousands of distinct answers (the largest probed school is about 117k answer rows).
- **Question rows without a type.** Questions stored with no `type` drop out of the question-type summary, if any such rows exist in production.
- **Behavior 8 commit alone has a type error.** At that commit, `sidebar-counts.test.tsx` already references `joinRequests`; Behavior 9 fixes it, and HEAD is clean.
