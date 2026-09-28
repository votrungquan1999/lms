# Visual QA tour-writing brief

You are writing **one Playwright tour file** that drives the LMS to every UI state
worth photographing in your assigned feature, and snaps each one. A separate
review pass will look at the images and hunt for defects — your job is only to
make sure the states get captured, correctly and reproducibly.

## The environment is already running — do not restart it

- Next.js dev server: **http://localhost:3011** (already up, shared with other agents)
- Database: **mongodb://localhost:27017/lms_visual** (already seeded, shared)
- **Never drop, reset or re-seed the database.** Other agents are using it.
- **Never restart or kill the server.** If it looks down, say so and stop.
- **Never edit** `playwright.visual.config.ts`, `visual-qa.json`, `e2e/visual/snap.ts`,
  `e2e/visual/visual.auth.ts`, or anything under `src/`. Read `src/` freely.

## Running your tour

```
npx playwright test --config playwright.visual.config.ts e2e/visual/<feature>.tour.ts
```

Run **only your own file**. Runs take ~30s. Iterate until every test passes.
Your run is for correctness only — the orchestrator does one clean serial
capture at the end that produces the images actually reviewed.

## Seeded data you can rely on

- Course `seed-course-fundamentals` — "Sandbox: Fundamentals"
- Test `seed-test-visible` — "Sandbox: All visibility ON" (3 questions: free_text, single_select, multi_select)
- Test `seed-test-hidden` — "Sandbox: All visibility OFF" (same 3 questions)
- 15 seeded students covering every grading scenario: alice (not started), bob (in progress),
  carol/dan/eve (submitted), frank/grace/hank (graded), ivy (redo requested),
  jack (redo then resubmitted), kelly/leo/mia/noah/olive (AI-grading candidates).
  These are DB-only stubs — they cannot log in.
- One real, loginable student: username `visual-student`, name "Nguyen Thi Phuong Thao",
  enrolled in the seeded course. Its session is `playwright/.auth/student.json`.
- No pools and no join requests are seeded — those list pages are genuinely empty.

Useful URLs: `/admin/courses/seed-course-fundamentals`,
`/admin/courses/seed-course-fundamentals/tests/seed-test-visible`,
`/admin/grading/seed-test-visible`.

## Auth

Tours run as the **admin** by default (the config sets `storageState`).
A student-side tour must opt in at the top of the file:

```ts
test.use({ storageState: "playwright/.auth/student.json" });
```

A logged-out tour uses `test.use({ storageState: { cookies: [], origins: [] } })`.

## How to pick states: rank by how likely they are to hurt someone

Read each screen's component and note every condition that changes what is shown:
empty checks, loading and error flags, disabled conditions, limits, long content.
Then ask whether a user can actually get there.

- **Yes, or you cannot prove otherwise** → it is a real state. "Nobody would do that"
  is not a reason to skip. Only a line of code that makes it impossible is.
- **Tier 1 (capture always)** — reachable in normal use:
  - every screen with the stress inputs: **empty, one item, many items, a long name with
    spaces, and one unbroken string** (a pasted email/URL/handle — unbroken strings are
    what push layouts off the screen)
  - anything one wrong tap away: submitting an empty form, acting too early, going back mid-flow
- **Tier 2 (after tier 1)** — rare but the user gets stuck: failed submit, validation errors,
  permission denied, bad saved data
- **Tier 3 (if there is room)** — cosmetic-only variants, count extremes
- **skip** — only with the source line that proves it unreachable

Aim for roughly **6–12 states**. Prefer breadth of tier 1 over depth.

## Writing the tour

```ts
import { expect, test } from "@playwright/test";
import { prepareVisualPage, snap } from "./snap";

const SOURCES = ["src/app/admin/(dashboard)/courses/page.tsx"];

// Must run before any page.goto(): a clock frozen after load shows nonsense timers.
test.beforeEach(async ({ page }) => {
  await prepareVisualPage(page);
});

test("courses: list with one course", async ({ page }) => {
  await page.goto("/admin/courses");
  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
  await snap(page, "courses/list-one", { sources: SOURCES });
});
```

Rules for every `snap()` call:

- **Name is `"<feature>/<state>"`, kebab-case.** The helper rejects anything else.
  `<feature>` is your assigned feature name, on every call.
- **Wait for proof the state arrived, then snap.** Snapping before it renders
  produces a false defect. Tours assert nothing about behaviour, but they always wait.
- **Pass `sources`** — the component files this state renders from, so findings can
  cite `file:line`. Be accurate; a wrong path wastes the reviewer's time.

`snap()` captures the full page as screen-height tiles, including below the fold and
anything spilling past the right edge. Never scroll or resize.

## Reaching states

This app is **server-rendered**. `page.route()` cannot fake data for a server
component — it only works for client-side fetches. To get data on screen, either
drive the real UI (create a course, add a question) or use the seeded rows.

To reach an **empty** state, create a fresh entity through the UI (a new course has
no tests; a new test has no questions) rather than deleting seeded data.

**Namespace everything you create** with your feature name, e.g. `"[pools] Long course
name …"`, so other agents' captures are not polluted. Never rename or delete seeded rows.

Good stress values:
- long name with spaces: `"Nhập môn Cấu trúc dữ liệu và Giải thuật nâng cao cho sinh viên năm hai"`
- unbroken string: `"nguyenthiphuongthao.khoahoccoban2026@student.university.edu.vn"`

## What to hand back

1. `e2e/visual/<feature>.tour.ts` — passing.
2. `e2e/visual/states/<feature>.md` — the state list, one line per `snap()`:

```md
## <feature> (src/app/.../page.tsx)
- [T1] <feature>/list-empty: a course with no tests yet
- [T1] <feature>/unbroken-title: title pasted as one long email-like string
- [T2] <feature>/create-invalid: Create submitted with the title blank
- [skip] <feature>/over-limit: unreachable, the form caps length at 200 (form.tsx:48)
```

3. A short final message: the states you captured, anything you could not reach and
   why, and anything that looked broken while you were driving it (note it, do not fix it).

Do **not** write a report, do **not** fix any bug you find, and do **not** commit.
