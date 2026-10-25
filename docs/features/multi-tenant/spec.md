# Multiple Schools (Multi-Tenant) — Living Spec

The LMS used to serve one implicit school: any admin saw and changed every course, student, question pool and join request. Now one deployment and one MongoDB database serve many isolated **schools**. The platform owner creates schools and picks each school's admins; a teacher works inside one school at a time and can switch between the schools they belong to; a student can belong to several schools and works in one at a time; existing data moves into a `default` school through an operator-run backfill. The same work closes four older id-trust gaps — admin actions that trusted ids, the student test/course binding, question media keys, and username uniqueness (D12). The architecture and its binding rules for future code are in [the ADR](../../../documents/adr/multi-tenant-schools.md).

## Schools and the Owner Console

**Only the platform owner creates schools and opens the schools console** (D8, D36).

- The owner is a recorded admin **and** an `ADMIN_EMAILS` address. Both are required; the email alone grants nothing.
- A school has a display name and an owner-typed slug. The slug is trimmed, must match `^[a-z0-9-]+$`, and must be unique; a clash says "A school with that slug already exists" (D62).
- Names may repeat; the slug is the only unique key (D63). Vietnamese names are never folded into slugs.
- A school's `id` is a random UUID and is its identity everywhere else (`schoolId` fields, the active-school cookie). The slug is a handle for scripts; the name is for display only.
- Creating a school gives nobody a membership, the owner included. The owner has no implicit access to any school's data and must add themselves as an admin to see it (D11).
- The console pages check the owner themselves, not only through the layout (D24); a non-owner admin gets forbidden. The sidebar's "Schools" link shows only for the owner, as a convenience.

**Where it lives:** `src/lib/school-service.ts` (`SchoolService.createSchool`, `listSchools`, `getSchool`); `src/app/admin/(dashboard)/schools/page.tsx` and `actions.ts` (`createSchoolAction`); `AuthService.requireOwnerSession`; `PageGuard.requireRoleManagerLogin`.

## School Admins and Revoking Access

**The owner makes an existing signed-up account an admin of a school and can remove them again; revoking someone's admin role takes them out of every school** (D21, D29, D37).

- The owner picks from the account list the role page already shows; there are no email invites (D29). The picker keeps its 100-account cap and shows "Showing first 100 of N accounts." (D65).
- A school's admin roster is built from its memberships, not the capped picker, so an admin beyond the first 100 accounts still shows and can still be removed (D89).
- Adding writes the admin role first, then the membership (D60). An interrupted add leaves an admin with no school, never a membership without the role.
- A school that doesn't exist is refused with "School not found" before anything is written. A repeat add says "This account is already an admin of this school."; a deleted account says "That account no longer exists."
- An account with a student profile may be made an admin (D64). While it holds the role, sign-in treats it as staff; revoking the role later restores the untouched student profile.
- Removing a membership leaves the admin role in place. Removing someone who isn't a member writes nothing and says "This account is not an admin of this school."
- Revoking the admin role on the user-roles page deletes every membership the account holds (D37). A later grant restores no school; the owner re-adds each one.
- Granting the admin role on the user-roles page gives no school. The account signs in to the no-school page until the owner adds it to a school (D21).
- `user.role = "admin"` stays the staff-account switch; school access comes only from memberships (D21).
- Every add, remove and role change stamps `schoolAccessManagedAt` on the user. The backfill never grants anything to an account carrying it (D38).
- A refused owner action is logged as `lms.reason: not-owner` with the caller's user id, or as `unauthenticated` (D81).

**Where it lives:** `src/app/admin/(dashboard)/schools/actions.ts` (`addSchoolAdminAction`, `removeSchoolAdminAction`) and `schools/[schoolId]/page.tsx`; `src/app/admin/(dashboard)/user-roles/actions.ts` (`revokeAdminAction`); `SchoolService.addMembership`, `removeMembership`, `deleteMembershipsForUser`; `UserRoleService.setRole`, `findUsersByIds`.

## Active School and the Switcher

**An admin always works inside one active school, resolved from their memberships on every request; URLs never name a school** (D5, D22, D23).

- Exactly one membership: that school. Otherwise the school named in the `lms_active_school` cookie, if the admin still belongs to it. Otherwise their first school by name (case-insensitive, ties broken by id).
- The cookie is only a hint. Its value is compared against the admin's own membership list and never reaches a query, so a tampered or revoked value just falls through (D59).
- The cookie is httpOnly, `sameSite: lax`, secure in production, unsigned, and lasts 400 days, so the last choice survives between sign-ins (D79).
- Memberships are read once per server render — the session lookup, layout, page and breadcrumb slots share that read — and fresh on the next request, so a removed membership takes effect on the very next request (D130).
- The sidebar header shows the active school's name (D13). With two or more schools it becomes a switcher listing the others; two schools with the same name look identical there (D63).
- Switching re-checks membership on the server, sets the cookie, and redirects to the dashboard, because the open page's ids belong to the old school. A switch to a school the admin doesn't belong to throws to the error page.
- A student in several schools gets the same switcher in the student sidebar (MS-D18). Its switch action re-checks the target against the student's own schools, sets the same cookie and redirects to the student dashboard.
- Every school page and breadcrumb slot resolves its own school through `requireSchoolAdmin()`; the dashboard layout only requires a signed-in staff account (D24). School actions use `requireAdminSession`, which fails closed without a school (D22, D47).

**Where it lives:** `src/lib/auth-service.ts` (`resolveActiveSchool`, `classify`, `requireAdminSession`); `src/lib/active-school-cookie.ts`; `SchoolService.listSchoolsForRequest`; `src/app/admin/(dashboard)/switch-school-actions.ts`, `admin-sidebar.tsx`, `layout.tsx`; `src/components/school-switcher.tsx`; `src/app/student/(dashboard)/switch-school-actions.ts`, `student-sidebar.tsx`, `layout.tsx`; `PageGuard.requireSchoolAdmin`.

## Admins With No School

**A staff account with no school membership sees "You aren't part of any school yet" and reaches no school's data** (D21).

- Every school page redirects such an account to `/admin/no-school`, which itself only requires a staff sign-in (it would otherwise redirect to itself).
- The platform owner also sees a "Go to the schools console" link there (D114). On a fresh install the owner has no school yet, so this is their way forward; they are not auto-redirected.
- School actions refuse such an account with "Unauthorized: not part of any school yet".

**Where it lives:** `src/app/admin/(dashboard)/no-school/page.tsx`; `PageGuard.requireSchoolAdmin`, `requireAdminLogin`.

## Stale Tabs After a School Switch

**A create form opened before the teacher switched school in another tab cannot create a record in the newly active school** (D42). A student's test tab gets the same protection: start, save an answer and submit all refuse once the active school changed (MS-D8).

- Create Course, Create Pool, Create Student, Add Existing Student and Bulk Import carry the school they were opened in: a hidden `expectedSchoolId` field on the four forms, a third argument on the bulk import.
- A mismatch **or a missing value** is refused with "Your active school changed" and nothing is created (D131).
- The student test forms (start, answer, submit) and the deadline auto-submit carry the school too. A mismatch or missing value is refused with "Your active school changed — switch back to <school> to continue", the school being the one the form was opened in, looked up from the student's own schools; an unknown or missing id gets the copy without a name. The check runs before the enrolment check, and nothing is written (MS-D25, MS-D33).
- Photo-upload slot requests are not guarded; they write nothing (MS-D20).
- By-id actions in a stale tab get the same generic "not found" as any other school's id (D66); only root creates name the cause.

**Where it lives:** `src/lib/expected-school.ts` (`assertExpectedSchool`, `ACTIVE_SCHOOL_CHANGED_MESSAGE`, `EXPECTED_SCHOOL_FIELD`); `src/components/expected-school-field.tsx` (`ExpectedSchoolField`); the create actions in `courses/actions.ts`, `pools/actions.ts`, `students/actions.ts` and `students/bulk-import-actions.ts`; the student test actions in `src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/actions.ts` and the auto-submit in `countdown.state.tsx`.

## What Is Isolated

**A school admin sees and changes only their own school's courses, tests, questions, students, enrolments, grades, pools and join requests; another school's id behaves exactly like a missing one** (D18, D20, D66).

- Five tables carry `schoolId` (course, test, question pool, pool question and join request); the student carries a `schoolIds` set instead (MS-D5). It is stamped on create and filtered in every list and by-id query — a student by membership in the set.
- Every other school-owned table — questions, answers, grades, annotations, feedback, AI suggestions, redo requests, test starts, submissions and enrolments — carries no `schoolId` and belongs to a school through its parent (D20).
- Every school-owned service is **school-bound**: built for one school by `getXService(schoolId)` from the verified session's school, cached one instance per school, and built only from that same school's dependencies (D18).
- A school-bound service or getter refuses to be built without a school (D32).
- **Enrolment is school-bound without being stamped** (D116). Every enrolment read keeps only rows whose course and student are both this school's; every enrolment write refuses another school's course ("Course not found") or student ("Student not found").
- That makes the dashboard counts, the grading hub, the grading headers, the Students page course count and the enrol dialog correct with no page-level filtering.
- Saving the enrol dialog requires every ticked student to be this school's, else "One or more selected students were not found." (D118).
- A bulk import naming another school's or an unknown course is refused before any student or sign-in account is created (D69).
- Join requests: each school's queue and its count show only its own requests, including those from students who belong only to another school; a student's "request waiting" notice counts their pending requests in every school (D87, MS-D14, MS-D37).

**Where it lives:** `src/lib/services-singleton.ts` (`forSchool` and every `getXService(schoolId)`); `src/lib/assert-school-id.ts`; `src/lib/enrollment-service.ts`; `src/lib/course-service.ts`, `test-service.ts`, `student-service.ts`, `question-pool-service.ts`, `pool-question-service.ts`, `course-join-request-service.ts`.

## Child Writes and Entry-Point Checks

**Every write to a child record looks its parent up through its own school's service first, inside the service** (D120–D124).

- Each child service holds its own school's `TestService` (the pool-question service holds its school's pool service, and `TestService` its school's course service).
- `TestService.requireTest(testId)` throws "Test not found" for a missing, deleted or other-school test. `createTest` throws "Course not found" and `addPoolQuestion` throws "Pool not found" when the parent isn't this school's.
- Covered writes: question add, import, compose, update and delete; grade; auto-grade; annotations; feedback; per-student release; delete submission; redo request and resolve; answer submit; test submit; AI Apply; and the three AI draft methods, which refuse before calling the model (D123).
- Question update and delete take `(testId, questionId)` and match both, so a question can only be changed through its own test; a miss throws "Question not found" (D122).
- `TestService`'s own by-id writes (settings, release grades, release correct answers, delete) match the school and throw "Test not found" on no match (D124). Course, pool and pool-question by-id writes and join-request approve/reject match the school too (D53, D93, D95, D96).
- New tests and pool questions are stamped with the service's own school only after the parent was found in that school (D121).

**Every admin action, page and route that takes a test, question, student, suggestion or pool id also checks the parent before any read or write, as defence in depth** (D31, D56).

- Resolve the test through the school-bound test service; check it is under the URL's course; check the question is the test's own live question; for a write aimed at one student, check enrolment in the test's course.
- Pools resolve through the scoped `getPool`; a pool question must be the pool's own.
- Pages answer `notFound()`, and no title from the other school shows in the page or its breadcrumb.
- The results-report download checks the course and the student against the school before enrolment, so every foreign id is a 404; the 403 is left for this school's own student who isn't in this school's course (D117).
- A grading link naming a student who isn't on the roster falls back to the first roster student, as before; the roster only holds this school's enrolled students (D67).
- AI Apply only applies a suggestion whose own test and student match the verified pair (D55).
- Approving a join request confirms the student exists (otherwise "Student not found" and the request stays pending, D129), claims the request, adds this school to the student's schools, then enrols them; each step is safe to repeat, so a retried approval finishes a half-done one (MS-D13).

**Where it lives:** `TestService.requireTest`; `QuestionService.getQuestion`, `updateQuestion`, `deleteQuestion`; `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/test-parent-check.ts` (`resolveOwnedTest`, `assertQuestionInTest`, `assertGradingTarget`); `courses/[courseId]/results-report/download/route.ts`; `join-requests/actions.ts` (`approveJoinRequestAction`).

## Question Images

**A school admin can only attach question images uploaded for their own school** (D26, D57).

- New uploads go under `media/schools/<schoolId>/questions/<uuid>.<ext>`.
- Adding a question or a pool question accepts only keys matching that exact, anchored pattern for the session's school. `..`, an extra path segment, `?` or `#`, content before the media path, legacy `media/questions/…` keys and other schools' keys are all refused.
- Media is set only at create time, and compose copies media from pool questions that were already checked.
- Images already stored under legacy keys keep rendering unchanged.

**Where it lives:** `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/question-media.schema.ts` (`isValidQuestionMediaKey`) and `question-media-actions.ts`; the two add actions in `tests/[testId]/actions.ts` and `pools/pool-question-actions.ts`.

## Students

**A student's schools are taken from their student record; one is active at a time** (D6, MS-D7). The active school is chosen like a teacher's: the school in the active-school cookie if the student belongs to it, else the first by name. A student with no cookie can land in a newly gained school that sorts first (MS-D33). "The school used last" is per browser and not cleared on sign-out (MS-D34). A student whose schools no longer exist gets no session.

- The student session carries the school, and every student page and action works inside it. The dashboard shows the school's name next to only that school's courses (D13).
- A student can only start, answer and submit a test of a course they are enrolled in, inside their school. Pairing their course with another course's or school's test, or with a question from another test, is refused; the test page answers not found.
- **Invite links:** the link's course decides the school. Username/password sign-up and Google sign-up both create the student in that school. An invite to a course with no school is an invalid invite (D50).
- A signed-in student opening another school's invite sees the request form, and the request is filed in the invite course's school queue for that school's admin to approve (MS-D14).
- **Google sign-up:** one student profile per sign-in account, enforced by a unique index (D40). A second tab or reload finishing the same invite gets the same "waiting for approval" outcome (D72).
- If the Google account already has a profile in another school, the invite page files a pending request in the invite's school and says "waiting for approval"; no second profile is created and the student is never told the link is for another school (MS-D17).
- **Add existing student:** a school admin adds a student who already has an account, in any school or none, by username (trimmed, any capitalisation). The student is added at once, with no consent step and no undo, and the success message names them by name and username. An unknown or empty username, a student already in the school, and a form opened under a different school are refused and change nothing. A student with no school can be added (MS-D26, MS-D39).
- **Usernames are unique across every school**, enforced by a unique index; lookups are case-sensitive exact matches and login is unchanged (D7).
- **Bulk import compares usernames lowercased**, in the preview and again on confirm, against every school's students and within the file, so "Alice" and "alice" are the same name and case variants in one file are both flagged as duplicates. A name that already exists shows as "Already exists" with a hint to use "Add existing student"; Create Student's taken-username error carries the same hint (MS-D11, MS-D19, MS-D41). The accepted cost: "taken" reveals that the name exists in another school.
- A taken name on self-signup says "That username is already taken. If it's yours, sign in instead; otherwise choose another." (D71); on the Google username form, "That username is already taken. Please choose another." When two sign-ups race, the database refuses the loser.
- Duplicate username and duplicate sign-in account are typed errors (`DuplicateUsernameError`, `DuplicateAuthAccountError`), told apart by which index refused the insert, never by message text (D58, D127).

**Where it lives:** `src/lib/session.ts` (`StudentSession.schoolId`); `PageGuard.requireEnrollment`; `canWorkOnTest` in `src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/actions.ts`; `src/lib/school-directory.ts` (`findAssignedInviteCourse`); `src/app/join/[token]/actions.ts`, and `page.tsx`; `src/lib/google-student-provisioner.ts`; `src/lib/student-service.ts`; `addExistingStudentAction` and `add-existing-student-dialog.tsx` in `src/app/admin/(dashboard)/students/`; `ensureIndexes` in `src/lib/database.ts`.

## Records With No School

**A record with no school is visible to no school, and nothing ever falls back to the default school** (D14, D32).

- A course or pool whose `schoolId` is missing or `null`, and a student whose `schoolIds` is missing or empty (MS-D6), never shows in any school's lists or by-id lookups; children under it stay hidden with it.
- A service or getter built without a school throws before any query. The Mongo driver would turn `undefined` into `null`, which matches exactly these unassigned records.
- A student with no school gets no session and lands on "Account Not Set Up". Google sign-up never creates a second profile for them (D40, D100).
- An invite link to a course with no school doesn't work (D50).
- If the new build boots before the backfill, every admin sees the no-school page and all data stays hidden — the intended fail-closed outcome (but see "duplicates block the boot" below).

**Where it lives:** `src/lib/assert-school-id.ts`; `forSchool` in `services-singleton.ts`; `AuthService.classify` and `resolveUnclassifiedIdentity`; `SchoolDirectory.findAssignedInviteCourse`.

## Operator Scripts

**Scripts address a school by slug and never write a school-owned record without a school** (D28, D43).

- `scripts/create-test.ts` puts the new test in its course's school; data files are unchanged. It refuses "course not found" and "course has no school; run backfill-schools first" (D90). It reads the course raw on purpose: a school-bound service can't be built before the school is known.
- `seed-pools.ts` and `seed-test-states.ts` take `--school <slug>` (default `default`), create that school if it's missing with the slug as its name (D88), and stamp the school on their own sandbox rows an older build left without one.
- `seed-coding-test.ts` takes its school from the sandbox course and refuses a course with no school.
- `seed-pools.ts` also takes a local-only `--mongo-uri <uri>` and refuses any host that isn't localhost, including an unparsable URI (D61, D92).
- `seed-test-states.ts` stops on an enrolment refusal instead of swallowing it (D133).
- e2e: `e2e/auth.setup.ts` creates the `e2e` school with the admin's membership; `e2e/visual/visual.auth.ts` does the same for `default`; `e2e/seed.ts` stamps the `e2e` school and throws if it is missing (D84).

**Where it lives:** `scripts/create-test.ts`, `seed-pools.ts`, `seed-test-states.ts`, `seed-coding-test.ts`, `mongo-uri-guard.ts`, `script-args.ts`; `SchoolService.ensureSchoolBySlug`; `e2e/auth.setup.ts`, `e2e/visual/visual.auth.ts`, `e2e/seed.ts`.

## Backfill and Deploy Runbook

**Existing data and admins move into a `default` school through `scripts/backfill-schools.ts`, run by a human operator in a fixed order; the full runbook is in [`scripts/instruction.md`](../../../scripts/instruction.md#multi-tenant-backfill-runbook)** (D10, D27, D41).

What the script does:

- **Dry run by default; `--apply` writes.** `--school-name` is optional (default "Default school"); the slug is always `default`. It prints the target host and database, credentials stripped, before its first read.
- **Duplicates first.** It lists duplicate usernames (missing and null count as one value) and duplicate sign-in accounts, with each row's id, sign-in account, created date and enrolment count. `--apply` stops before any write while any exist (D39).
- **Indexes before data.** `--apply` builds the correctness indexes, so a conflict reaches the operator rather than a boot, and drops the old unscoped join-queue index.
- **The `default` school** is upserted by slug; a rerun never changes its id or name.
- **Roots** (courses, students, pools) with no school are stamped `default` only while `default` is the only school. Once another school exists they are reported and left unassigned (D73).
- **Children** (tests, join requests, pool questions) take their parent's current school. Orphans, children waiting on an unassigned parent, and children in a different school than their parent are reported, never changed.
- **Legacy admins** (admin role, no access marker) get a `default` membership and the marker. A rerun after a stop between those two writes just sets the marker (D126).
- **Stale memberships:** a `default` membership whose user is no longer an admin — revoked by the old build between the two applies — is deleted (D105).
- **Cross-school enrolments** are listed by id and never changed (D119).

The hard rules, restated:

- **Order.** Dry run, then `--apply`, against production **before the branch is pushed** — Vercel previews of the branch use the production database. Run `--apply` again **right after the production promote**. No second school and no new school admins until the deploy is verified.
- **Vercel Standard Protection is a standing control.** Before a second school exists, delete or protect every older deployment. The `lms` project's Standard Deployment Protection must never be relaxed, and no Shareable Links or bypass tokens may be issued for non-production deployments once a second school exists: an older build ignores schools and serves every school's data.
- **No rollback once a second school exists.** A pre-multi-tenant build would show every admin every school's data; fixes go forward only.
- **Duplicates block the boot.** While duplicate usernames or sign-in accounts exist, the new build cannot create its unique indexes and every request fails until they are resolved (D107). The dry run lists them; the recovery steps are in the script's JSDoc.
- **The branch merges as one unit**; intermediate commits lock out admins with no membership.
- **After deploy, never use an older checkout's `scripts/create-test.ts`**: it writes tests with no school, which no school can see.
- **An agent never runs any script against production**, not even a dry run.

**Where it lives:** `scripts/backfill-schools.ts`; `scripts/mongo-target.ts` (`describeMongoTarget`); `scripts/instruction.md` ("Multi-Tenant Backfill Runbook"); personal-infra's `resources/vercel-projects.ts` for the protection setting.

## Known Limits and Out of Scope

- **Deadline auto-submit in a stale tab is refused.** The student switches back to submit; the server has no deadline enforcement of its own (pre-existing) (MS-D35).
- **Reopen the invite after signing in.** An existing student who is signed out signs in first, then opens the invite link again (MS-D38).
- **Adding a student is final.** An admin can add a student without their consent, there is no undo, and nothing removes a student from a school (MS-D12, MS-D39).
- **No pending-request list for students.** The dashboard shows only that a request is waiting (MS-D12).
- **Course link from another school.** A link into a course of the student's other school gives the plain not found, as for admins until they switch (MS-D36).
- **100-account picker.** An account beyond the first 100 can't be picked as a school admin from the console (D65). The roster itself has no cap.
- **Child reads still rely on the parent check.** `listQuestions`, `getGrades`, `getLatestAnswers`, `getAnnotations`, `getTestFeedback` and `getSuggestionsForStudent` are keyed by the parent id and would return another school's rows if handed its test id. They are safe only because every entry point resolves the test first.
- **Test starts are shared.** `TestStartService` is not school-bound; `recordStart` is guarded only by the student actions' course and enrolment check.
- **The test harness builds its own copy of the per-school wiring.** `src/lib/__tests__/services-singleton-wiring.test.ts` checks the real wiring so the copy can't silently drift (D125).
- **The per-render membership memo is unproven by tests.** Under Vitest, `React.cache` is a pass-through, so only a real Next render shows it (D130).
- **Global usernames reveal existence** across schools (D7).
- **An enrol dialog rendered before the enrolment change** that still ticks an out-of-school student gets "One or more selected students were not found."; a reload fixes it (D118).
- **Index changes apply at each environment's next boot.**
- **Not built:** renaming or deleting a school, moving records or students between schools, email invites for admins, an owner "view all schools" mode, and branding beyond the school name (D6, D11, D13, D29).
