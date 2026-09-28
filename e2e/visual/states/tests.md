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
