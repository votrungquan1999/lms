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
