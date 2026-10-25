# ADR: Multiple Schools — School-Bound Services Over One Shared Database

**Date:** 2026-10-05
**Status:** Accepted, implemented
**Deciders:** Project Owner

## Context

The LMS served one implicit school. Any admin saw and changed every course, student, question pool and join request, and several admin actions trusted the ids a form or URL handed them. The product needed many schools on one deployment and one MongoDB database, each school seeing only its own data, with existing production data moved into a first `default` school.

Isolation over shared collections lives entirely in app code: there is no database-level tenant boundary, so a single query keyed only by an id is enough to leak one school's records (likely minors' grades) to another. Four older id-trust gaps had to close as part of the same work for the same reason (D12): admin actions trusting ids, the student test/course binding, question media keys, and username uniqueness.

Decision ids (D#) below refer to the feature's planning log, which is not committed. Every rule that matters is restated here in full, so this ADR — not the log — is the durable source. The behavior itself is described in the [living spec](../../docs/features/multi-tenant/spec.md).

## Decision

### A school is resolved from the session; URLs stay unchanged (D4, D5)

A school owns its admins (through memberships), its students, its courses and everything under them, and its question pools. A student's schools come from their student record (a set); an admin's active school comes from their memberships on every request. No route names a school.

**Alternatives considered:**
- **A path prefix** (`/s/<slug>/…`) — moves every route and every `revalidatePath` call.
- **A subdomain per school** — needs wildcard DNS, per-host OAuth setup and infrastructure changes outside this repo.

**Why:** the session already exists on every request, so resolving the school from it costs nothing structural, and the server never has to trust a school named by the client.

### Custom `school` and `school_membership` collections, not better-auth's organization plugin (D19, D21)

`SchoolService` owns two collections: `school {id, name, slug, createdAt, createdBy}` with a unique `slug`, and `school_membership {id, schoolId, userId, createdAt, createdBy}` unique on `{schoolId, userId}`. `user.role = "admin"` stays the staff-account switch; school access comes only from memberships. Only the platform owner (recorded admin **and** `ADMIN_EMAILS`) creates schools and grants or removes school admins (D8), and the owner has no implicit access to any school's data (D11).

**Alternatives considered:**
- **better-auth's organization plugin** — ready-made organizations, members and invitations.
- **Replacing the admin role with memberships** — one source of access instead of two.

**Why:** the plugin's create endpoint is open to any signed-in user, students included; its invitations need email, which the app cannot send; its roles duplicate `Role`; and it breaks the rule that better-auth handles only authentication. Keeping the role preserves the owner's two-factor check and lets an owner with no school still reach the schools console. An owner "view all" mode was rejected because a bypass branch in every scoped query is the classic leak path.

### Sessions carry the school (D22, D34, D47, D80)

- `AdminSession.school: UserSchool | null` — the active school, or none.
- `SchoolAdminSession` — an `AdminSession` whose `school` is non-null, narrowed by a type guard. `AuthService.requireAdminSession` (every school action) and `PageGuard.requireSchoolAdmin()` (every school page and breadcrumb slot) return it and fail closed without a school.
- `StudentSession.schoolId: string` — from the student record.
- `AuthService.requireOwnerSession` is a separate check that needs no school, because the owner must create the first school before belonging to any.

**Alternatives considered:**
- **A separate school-resolver call in every action** — no session change.
- **Flat `schoolId` + `schoolName` fields** on the admin session.
- **A `{ session, schoolId }` wrapper** or non-null assertions at each call site.

**Why:** one resolution per request, and the type makes a missing school impossible to ignore — about 130 call sites read `session.school.id` with no assertion. One `{id, name}` object can't have its id and name disagree.

### The active-school cookie is a compare-only hint (D23, D59, D79, D130)

The active school is: the only membership; else the school in the `lms_active_school` cookie if the admin still belongs to it; else their first school by name (case-insensitive, sorted in app code, ties by id). The cookie is httpOnly, `lax`, secure in production, unsigned and long-lived. Its value is **only ever compared** against the admin's own membership list. It never reaches a query, a cache key or a service constructor. Memberships are read once per server render (a per-instance `React.cache` memo) and fresh on the next request; the switch action re-reads them uncached.

**Alternatives considered:**
- **A forced picker page** for admins with two or more schools and no choice.
- **Looking the school up by the cookie's id**, or sorting by name in Mongo.
- **Carrying the schools list on the session** instead of a per-render memo.

**Why:** no dead-end redirects for server actions, and the sidebar always names a school. An untrusted value that is only compared can at worst pick among the admin's own schools, and a revoked membership stops working on the next request. Mongo's default sort is case-sensitive. A session field would silently drop the switcher for any hand-built session.

### School-bound services, and which tables carry `schoolId` (D18, D20, D32, D85, D115, D116)

Every school-owned service is constructed for one school (`new CourseService(db, schoolId)`), stamps that school on every record it creates, and filters every list and by-id query by it. Pages and actions get services through `getXService(session.school.id)`; one `forSchool` helper in `services-singleton.ts` refuses an empty school, caches one instance per school, and each service is built only from its own school's dependencies.

`schoolId` is stored on five tables: **course, test, question pool, pool question and join request**; the **student** carries a `schoolIds` set matched by membership (MS-D5, MS-D6). These are the records looked up by their own id from a URL or form, or listed school-wide. Every other school-owned table — questions, answers, grades, annotations, feedback, AI suggestions, redos, test starts, submissions — is reached through a verified parent and keyed by that parent's id.

`StudentService.addToSchool` is the one service write that matches outside its school (by student id alone); the caller proves eligibility (MS-D30).

**Enrolment is the exception that proves the rule.** It is the only table joining two school-owned roots (course and student), so checking one side doesn't check the other. It stays unstamped, but `EnrollmentService` is school-bound: every read keeps only rows whose course **and** student are this school's, and every write refuses another school's course or student.

**Alternatives considered:**
- **A `schoolId` parameter on every method** — about 345 test seed edits, and one missed filter leaks.
- **An ownership-check layer in actions over unchanged services** — every action must remember it, and creates and lists still need the school.
- **Getters that read the school from the request implicitly** — a hidden dependency and a session lookup per getter.
- **Stamp every collection** — a bigger backfill and more writes; or **stamp only course, student and pool** — test lookups, the grading hub and the join queue then need joins.
- **Per-page enrolment filters** (the first implementation) — written three different ways, two sites missed, a count leak found late.

**Why:** isolation becomes structural rather than remembered, and most existing test files needed no changes. Each root lookup by id is one filtered query. For enrolment, one rule — "a row counts only if its course and its student are both this school's" — replaced every page-level filter, at the cost of one extra indexed lookup per read, run in parallel with the row read.

### Child writes check their parent inside the service; entry-point checks stay (D31, D101, D120–D124)

Originally (D31) the parent check lived only at the entry points: every action, page or route taking a test, question, student or suggestion id resolved the test through the school-bound test service, checked `test.courseId`, `question.testId` and, for a write to one student, enrolment. Review showed the gap this left: child services were "school-bound" only in their getter. `getQuestionService(schoolId)` read exactly like `getCourseService(schoolId)`, but its writes matched on id alone, so the next action copied without `resolveOwnedTest` would edit another school's question.

The rule now: **a school-bound service checks its own parents on every write.**

- Each child service holds its own school's `TestService` (the pool-question service holds its school's pool service, `TestService` its school's course service).
- `TestService.requireTest(testId)` throws "Test not found"; `createTest` throws "Course not found"; `addPoolQuestion` throws "Pool not found".
- `updateQuestion` and `deleteQuestion` take `(testId, questionId)` and match both, reversing the earlier id-only signatures (D54 → D122).
- `TestService`'s own by-id writes match `{ id, schoolId }` and throw on no match (D124).
- New tests and pool questions are stamped with the service's own school after the bound parent lookup succeeds (D121).
- The check covers every write of these services, including auto-grade, delete submission, redo resolve and the AI draft methods, which refuse before calling the model (D123).
- **D31's entry-point checks stay** as defence in depth (`resolveOwnedTest`, `assertQuestionInTest`, `assertGradingTarget`, the pool checks).

**Alternatives considered:**
- **Entry-point checks only** (D31 as first shipped) — no service changes, visible in review.
- **Read the parent collection directly with a `schoolId` filter**, as `EnrollmentService` does — no constructor change and about 200 fewer test-construction edits.
- **Copy `schoolId` off the parent document** — needs `schoolId` on the client-facing `Course` and `QuestionPool` shapes.

**Why:** the "live and this school's" rule for a parent then lives only in the parent service, and a real-wiring test can prove every dependent was built from its own school's instance. Copying the parent's `schoolId` adds no guarantee, because the bound lookup only finds a parent in the service's own school. Cost: one indexed `findOne` per write (once per call for auto-grade).

### Fail closed on a missing school (D14, D32, D50, D100)

A record with no school is visible to no school. No code path treats a missing school as `default`. Every bound constructor (`assertSchoolId`) and every real per-school getter (`forSchool`) throws on an empty or undefined school, before any cache or database access. The harness's mocked getters route strictly by school and throw on an unknown one. `Student.schoolIds` is a `string[]`, and an empty set fails closed; a student with no school gets no session and is never provisioned a second profile; an invite to a course with no school is invalid.

**Alternatives considered:**
- **Treat a missing school as `default`.**
- **Rely on types alone**, with harness getters falling back to the default school.

**Why:** the Mongo driver turns `undefined` into `null`, and `{ schoolId: null }` matches exactly the unassigned records — the one wrong value that would look like it works. Scripts and `vi.fn()` mocks aren't type-checked. A fallback is a permanent bypass branch, and the backfill already covers legacy data.

### `SchoolDirectory` holds the only unscoped lookups (D40, D51)

`SchoolDirectory` is the one school-agnostic reader of school-owned tables. Its allowed uses are closed:

- **Invite token → course and its school** (`findCourseByInviteToken`, `findAssignedInviteCourse`): the join page and the three join actions, which have no session to take a school from.
- **Student by username** (`findByUsername`): the registration pre-check, username sign-in, the Google provisioner and the seed scripts, because usernames are unique across schools.
- **Student by sign-in account** (`findByAuthUserId`): session classification, the unclassified-identity check and the Google provisioner, because one sign-in account has one profile across schools.
- **Existing usernames** (`findExistingUsernames`): the bulk-import preview.

It is never used to list or change a school's records. The old unscoped methods were deleted from `StudentService` and `CourseService` so the compiler found every caller. Uniqueness is enforced by unique `student.username` and `student.authUserId` indexes, not by find-then-insert checks; duplicate-key errors are told apart by `keyPattern` and surface as typed errors.

**Alternatives considered:**
- **Keep scoped and unscoped twins** of each lookup on the services.
- **App-level uniqueness checks only.**

**Why:** one lookup path with no scoped/unscoped twin to confuse; and one profile per sign-in account across schools needs an invariant the database enforces, because races and pre-backfill students would otherwise get a second profile.

### Deploy, preview and rollback rules (D10, D41, D73, D75, D107, review finding 11)

- **The backfill runs before the branch is pushed, and again right after the production promote.** Vercel previews of the branch run against the production database, so a push is a production deploy as far as data is concerned. The second apply catches what the old build wrote in between.
- **No second school until the deploy is verified**, and every older deployment deleted or protected first.
- **Vercel Standard Deployment Protection on the `lms` project is a standing tenant-isolation control**, not a one-time step. Every older deployment is a pre-multi-tenant build on the production database that ignores schools. Never relax the protection, and issue no Shareable Links or bypass tokens for non-production deployments once a second school exists.
- **No rollback once a second school exists.** A pre-multi-tenant build shows every admin every school's data; fixes go forward only.
- **Duplicates block the boot.** The unique indexes are built at boot; with duplicate usernames or sign-in accounts every request fails until they are resolved. The backfill lists them and refuses to apply while any exist.
- **Once another school exists, a backfill rerun never guesses a school** for an unassigned root; it reports it.

**Alternatives considered:**
- **Run the backfill only around the production deploy.**
- **A lazy read-time migration** instead of a script.
- **Have the boot swallow the duplicate-key error** and start without the unique index.
- **Treat old-deployment protection as a one-time runbook step.**

**Why:** previews make the push itself the deploy. A read-time fallback is the bypass this design rejects. A silent boot without the unique index would allow duplicates the code now relies on the database to refuse; a loud refusal to start is safer. Protection that someone can later relax without warning is only as good as its being written down as permanent.

### The rule for every future school-owned collection and by-id entry point

**A new school-owned collection:**
- **Root or child?** A record looked up by its own id from a URL or form, or listed school-wide, is a root: store `schoolId`, stamp it on create from the service's own school, filter every query by it, add a `{ schoolId: 1 }`-led index in `ensureIndexes`, and give the backfill a stamping rule. A record always reached through a parent is a child: no `schoolId`; its service takes the parent's school-bound service and checks the parent on every write.
- **A join between two roots** (like enrolment) is scoped on both sides in every read and write.
- **Bind the service:** take the school in the constructor and call `assertSchoolId`; expose it as `getXService(schoolId)` through `forSchool`, built only from the same school's services; mirror it in the harness (`makeSchoolServices` and the mocked getters in `src/tests/render-server-page.tsx`); add it to `services-singleton-wiring.test.ts` and `school-bound-services.test.ts`.
- **A by-id write that matches nothing throws** a "not found", never a silent success.
- **Scripts** sit outside `tsc`; any script writing these records outside the services must set `schoolId` explicitly.

**A new by-id entry point (action, page, route):**
- **Take the school only from the verified session** — `requireAdminSession` / `requireSchoolAdmin()` / the student session — never from the cookie, a form field or a URL.
- **Resolve the parent before any read or write**: `resolveOwnedTest`, `assertQuestionInTest`, `assertGradingTarget` for a write to one student, the scoped `getPool` for pools. A foreign id and a missing id get the same refusal or `notFound()`.
- **A root create form** carries `<ExpectedSchoolField>` and its action calls `assertExpectedSchool`.
- **Unscoped lookups go only through `SchoolDirectory`**, and only for the uses listed above.
- **Test it as another school:** an isolation row that acts as a non-default school's admin against live records of the default school and asserts refusal **and** that those records are unchanged, next to a positive row in the admin's own school.

## Consequences

### Positive

- One school's admins can no longer see or change another school's courses, students, grades or pools, and the four older id-trust holes are closed.
- Isolation is structural: a list or root lookup through a school-bound service cannot forget its school, and a missing school fails loudly instead of matching unassigned data.
- A new school is onboarded without a new install, by the owner, with no code or infrastructure change.
- Identity uniqueness moved into the database, so races fail at the index instead of producing a second profile.

### Negative

- **Isolation lives in app code over shared collections.** A raw `db.collection(...)` query, a script, or a service added without `forSchool` bypasses all of it; only review, the rules above and the isolation tests guard against that.
- **Child reads are still keyed by the parent id.** `listQuestions`, `getGrades`, `getLatestAnswers`, `getAnnotations`, `getTestFeedback` and `getSuggestionsForStudent` return another school's rows when handed its test id; they rely on the entry point's parent check. `TestStartService` stays shared.
- **Extra queries.** One indexed `findOne` per child write; enrolment reads add a parallel lookup (the Students page runs three queries per student); every admin request reads its memberships and schools once per render.
- **The test harness duplicates the per-school wiring.** The wiring test catches drift, but a new service must be added in both places.
- **The rollout is manual and one-way.** The deploy order is a human runbook, there is no rollback once a second school exists, duplicate identities block the boot, and preview protection on the Vercel project is now a standing dependency of tenant isolation.
- **Global usernames reveal** that a name exists in another school.
- **The owner sees no school's data without adding themselves**, and the admin picker is capped at 100 accounts.
