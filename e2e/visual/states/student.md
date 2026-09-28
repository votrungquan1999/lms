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
