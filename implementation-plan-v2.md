# Bulk Student Import (CSV / XLSX) — v2 (client-framed behaviors)

Let a **teacher/admin onboard a whole class at once** by uploading a `.csv` or `.xlsx`
file with columns `name`, `username`, `password`, instead of creating students one by one.
Two-stage flow:

1. **Upload → preview** — the teacher selects a roster file; the system reads it and shows a
   per-row preview (who will be created, who will be skipped and why) with summary counts.
   Nothing is written.
2. **Confirm → create** — the teacher confirms; valid rows become real student accounts,
   optionally enrolled into selected course(s); the teacher gets a per-student outcome report.
   Partial success is expected.

> **Revision note (v2):** behaviors are now written from the **client's** point of view (the
> teacher/admin), per `@create-implementation-plan`'s rule that a behavior must be externally
> observable, not a code task. The two internal pieces — the file-reader utility and the
> batch username lookup — have **no user-observable behavior of their own**, so per the
> project's BDD-vs-TDD rule they are demoted to **TDD inner-loop units**, each labeled with
> the consumer (its real client) that drives it. The user-facing BDD scenarios are Steps 3–5.

## User Review Required

> [!IMPORTANT]
> Locked decisions baked into this plan (not to be re-litigated):
> 1. **State management** — the bulk-import UI uses a **hand-rolled `createContext` +
>    `useReducer`** (like `results-report-selection.state.tsx`). `createReducerContext` does
>    NOT exist in the repo and is NOT used or created.
> 2. **Row transport** — the client calls the server actions **directly** as
>    `async (input) => Promise<State>` with typed arguments (`rows`, `courseIds`), NOT via
>    `FormData` / `useActionState`.
> 3. **Multi-course enrollment** — the confirm action **loops the existing
>    `EnrollmentService.enrollStudents` once per selected course**; no new service method.
> 4. **Row cap** — a hard **200-row maximum**, enforced BOTH client-side (parse) AND
>    server-side (preview + confirm).
> 5. **Per-row create** — sequential loop over `registerStudent`; partial success with a
>    per-row report.

> [!IMPORTANT]
> **Security trade-off:** passwords are supplied in plaintext in the uploaded file and the
> action payload. The teacher is responsible for the file. No auto-generation, no credential
> export (out of scope).

> [!IMPORTANT]
> **Non-transactional bulk create** — a mid-batch failure leaves earlier creates in place;
> surfaced row-by-row in the report, not rolled back.

## Technical Design

Only the non-obvious decisions; everything else follows existing repo patterns (see
`RESEARCH_OUTPUT.md`).

- **Client-side parsing only.** `xlsx` (SheetJS) is added via `pnpm add xlsx` and imported
  only inside the import UI parse path (dynamic/lazy) so it never enters the server bundle.
  The server receives parsed JSON rows (`{ name, username, password }[]`), never the raw file.
  The client validates *format* (readable, required headers, ≥ 1 row, ≤ 200 rows, trims,
  skips empty rows); the server owns *business* validation (field presence, password ≥ 8,
  in-file duplicates, existing-username) and re-enforces the 200-row cap.

- **New batch read `StudentService.findExistingUsernames(usernames: string[]): Promise<string[]>`.**
  A single `{ username: { $in: usernames } }` query (mirrors `findByIds`), returning the
  subset that already exist. The only new service method. **Inner-loop unit** — its client is
  the preview/confirm actions, not the end user.

- **Direct-call server actions (not `useActionState`).** `previewAction(rows)` and
  `importAction(rows, courseIds)` are plain `async (input) => Promise<State>`. They still
  follow repo conventions: `requireAdminSession` gate at the top, `zod` `.safeParse`,
  `withSpan(...)` around the success path, an `*State` return shape carrying per-row arrays +
  a summary.

- **Preview is read-only; confirm re-validates.** Confirm re-runs the same validation
  server-side (never trusts the client preview), so a stale/forged preview cannot cause bad
  writes.

- **Reuse `registerStudent` per row, sequentially.** The confirm action loops valid rows and
  calls the existing 2-phase `AuthService.registerStudent` (Better Auth signup + student doc
  + rollback), catching per-row to build the report. `revalidatePath('/admin/students')` on
  completion.

- **Multi-course enrollment loops `enrollStudents`.** After creates, for each selected course
  id the confirm action calls `enrollStudents(courseId, createdStudentIds, createdBy)` once.

- **Hand-rolled `createContext` + `useReducer` for the UI.** Component split per project
  convention into `.ui.tsx` (presentation), `.state.tsx` (context + reducer for the
  file → preview → report stage machine), `.type.ts` (shared types), each under 300 lines,
  JSDoc on every function. The Students `page.tsx` server-fetches the course list and passes
  it to the picker as props.

- **Validation rules mirror single-create** (`createStudentAction`): `name`, `username`,
  `password` required; password ≥ 8. Surfaced as per-row preview statuses: `valid`,
  `missing-field`, `password-too-short`, `dup-in-file`, `already-exists`.

## Behaviors to Implement

> Steps 1–2 are **TDD inner-loop units** (no standalone user behavior; labeled with their
> consumer/client). Steps 3–5 are **user-facing BDD scenarios** with the teacher/admin as the
> actor. Order preserves dependencies.

### Step 1 — [TDD unit · client: the bulk-import UI] The file-reader turns a roster file into rows, or a clear reason it can't

- [ ] Write test
- [ ] Run test
- [ ] Implement (if needed)
- [ ] Run test (if implemented)

Observable (to its consumer, the UI): given a `.csv`/`.xlsx` `File`, the reader returns
trimmed `{ name, username, password }` rows with fully-empty rows skipped; given an
unreadable file, a missing required header column, zero data rows, or more than 200 rows, it
returns a **specific format error** the UI can show the teacher — so Step 5 can render
"this file can't be used because …" without guessing.

**Test Type:** unit

### Step 2 — [TDD unit · client: the preview & import actions] The system can tell which usernames already belong to students

- [ ] Write test
- [ ] Run test
- [ ] Implement (if needed)
- [ ] Run test (if implemented)

Observable (to its consumer, the actions): given a batch of usernames where some already
exist in the `student` collection, `StudentService.findExistingUsernames` returns exactly the
existing subset (empty when none match) — the lookup that lets the preview tell the teacher a
username is already taken.

**Test Type:** unit (service)

### Quality Checkpoint (after steps 1-2)

- [ ] Review test quality (4 Pillars)
- [ ] Review code for refactoring

### Step 3 — [BDD · actor: teacher/admin] The teacher previews a roster and sees, per student, whether they'll be created or why they'll be skipped

- [ ] Write test
- [ ] Run test
- [ ] Implement (if needed)
- [ ] Run test (if implemented)

Observable: the teacher submits the parsed roster and, for each student row, sees a status —
`valid` (will be created), `missing-field`, `password-too-short`, `dup-in-file` (duplicated
within the file), or `already-exists` (username already in the system) — plus summary counts
(how many will be created vs skipped). **Nothing is created.** A non-admin caller is refused;
a roster over 200 rows is refused.

**Test Type:** integration (action + service + db)

### Step 4 — [BDD · actor: teacher/admin] The teacher confirms and the valid students are created, optionally enrolled, with a per-student outcome report

- [ ] Write test
- [ ] Run test
- [ ] Implement (if needed)
- [ ] Run test (if implemented)

Observable: after the teacher confirms, valid rows become real student accounts (the kind a
student can later sign in with); if the teacher selected courses, the new students appear
enrolled in each selected course; the teacher receives a per-student report (created, or
failed with a reason). One failing student does not abort the rest (partial success). A
non-admin caller is refused; over-200 rows is refused; the Students list is refreshed
afterward.

**Test Type:** integration (action + services + db)

### Quality Checkpoint (after step 4)

- [ ] Review test quality (4 Pillars)
- [ ] Review code for refactoring

### Step 5 — [BDD · actor: teacher/admin] A teacher onboards a whole class through the Students page in one pass

- [ ] Write test
- [ ] Run test
- [ ] Implement (if needed)
- [ ] Run test (if implemented)

Observable: from the Students page (next to "Add Student") the teacher opens the bulk-import
surface and picks a file; an unusable file shows a specific format error inline; a good file
shows a **preview table** with each student's status and summary counts; an optional
multi-select **course picker** lists available courses to enroll into; the **Import** action
is enabled only when at least one row is valid; after importing, the teacher sees the final
**per-student report**. Stage state (file → preview → report) is driven by the hand-rolled
`createContext` + `useReducer`.

**Test Type:** component (React Testing Library)

### Quality Checkpoint (after step 5)

- [ ] Review test quality (4 Pillars)
- [ ] Review code for refactoring

## Investigation Resolutions (applied to this plan)

Decisions resolved during Phase-3 investigation — these refine the steps above:

**Step 1 (file-reader util):**
- One code path for both formats: `XLSX.read(await file.arrayBuffer(), { type: "array" })`;
  header row via `sheet_to_json(ws, { header: 1, blankrows: false, raw: false })`.
- **"Unreadable" is detected structurally, not via try/catch** — XLSX almost never throws
  (garbage parses as a 1-line CSV; empty → empty sheet). Error cases = `unreadable` (rare
  throw fallback), `missing-header`, `zero-rows`, `too-many-rows`.
- `raw: false` is **required** (else numeric-looking usernames/passwords become JS numbers);
  util must `.trim()` each field itself.
- Returns a **typed discriminated-union result** (TS `enum` for the error kind, per repo
  rules — no string-literal union, no defensive throwing).
- Test runs in plain node (Node `File`/`arrayBuffer` available) — **no jsdom needed**.

**Step 2 (findExistingUsernames):** mirror `findByIds` — empty-input short-circuit → `[]`,
single `{ username: { $in } }` query, project to `username` strings, **no `.sort()`** (assert
unordered). Real-Mongo `withTestDb` test.

**Step 3 (previewImportAction):**
- Confirmed name **`previewImportAction(rows)`** (supersedes any `previewAction` prose).
- Classification order: `missing-field` → `password-too-short` → `dup-in-file` →
  `already-exists` → `valid`. `findExistingUsernames` called **once** with all candidates.
- **`dup-in-file` flags ALL occurrences** (not first-valid) so the teacher sees every conflict.
- Empty `rows` → **return an empty preview (success), not a rejection.**
- Usernames **case-sensitive** (matches `createStudentDocument`'s `findOne({username})`).
- `PreviewStatus` as a TS `enum` (values = the kebab strings). `z.array(...).max(200)` gives
  the over-cap rejection.
- Integration test uses `servicesSingletonMockFactory()` + `setupTestDb` (real service over
  test Mongo), with `auth-singleton` mocked (`requireAdminSession` resolved=pass / rejected=fail).

**Step 4 (bulkImportStudentsAction):**
- `createdBy` = literal **`"admin"`** (matches existing `createStudentAction`).
- Collect each created student `id` from `registerStudent(...)` return; after the loop call
  `enrollStudents(courseId, ids, "admin")` per selected course (empty `studentIds` and empty
  `courseIds` are both safe no-ops).
- **Test-wiring gap to close:** `getAuthService` is NOT covered by `servicesSingletonMockFactory`.
  The Step-4 test must wire `getAuthService` (mock of `auth-singleton`) to a **real**
  `AuthService` built via `createAuthService(db, …)` on the **same** test Mongo that
  `setupTestDb`/`servicesSingletonMockFactory` use, so creates and assertions hit one db.

**Step 5 (UI):**
- **No shadcn `Table` exists** → build the preview/report as a `grid` + `Card` + `Badge`
  tabular list (honors the "always grid" layout rule; no new dependency).
- Course label is **`title`** (CourseService returns `{ id, title, description, createdAt }`;
  there is no `name`). `page.tsx` (server) fetches `listCourses()` and passes them as props.
- Direct typed action calls (not `useActionState`); `create-student-dialog.tsx` is the
  reference only for the Dialog shell/trigger. Result rendering lives in the reducer.
- Component test: `// @vitest-environment jsdom` + RTL + `userEvent.upload`; mock `../actions`
  and `../parse-import-file` so lazy `xlsx` never runs. Keep `.ui.tsx` split small (300-line rule).

## Risks / Notes

- **Non-transactional bulk create** — partial success expected and surfaced per row.
- **Sequential per-row create** — `registerStudent` is inherently sequential; the 200-row cap
  bounds latency on the Atlas M0 tier.
- **Bundle size** — `xlsx` is loaded only inside the import component (lazy).
- **300-line file rule** — the UI is split across `.tsx` / `.ui.tsx` / `.state.tsx` / `.type.ts`.
```
