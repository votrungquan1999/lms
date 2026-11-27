## grading (src/app/admin/(dashboard)/grading/page.tsx, grading/[testId]/page.tsx, courses/[courseId]/tests/[testId]/grading/page.tsx)

- [T1] grading/hub-needs-grading: To grade — one course group with a waiting test row
- [T1] grading/workspace-student: /admin/grading/seed-test-visible as a grader lands on it — top bar with the student picker, number row, the first waiting student's answer and the grade panel
- [T1] grading/student-in-progress: bob focused — one free-text answer, grade form open, test not submitted
- [T2] grading/grade-in-progress-confirm: "Bob InProgress is still writing. Grade anyway?" dialog after picking bob in the student picker; Grade anyway is never clicked
- [T1] grading/student-blank-free-text: dan focused — submitted with the free-text left blank (the MC answers are auto-graded, so the roster badge reads Graded 2/2)
- [T1] grading/student-graded: frank focused — every question scored, feedback filled in
- [T1] grading/student-redo-requested: ivy focused — her answers read-only under "read-only while the redo is open", no grade panel
- [T1] grading/student-ai-suggestion: noah focused — AI suggestion panel with score, model, suggested solution, Apply and Regenerate
- [T1] grading/workspace-question: ?mode=question — question picker in the top bar, one box per student in the row and the chosen student's answer with the grade panel
- [T1] grading/course-scoped-unreleased: /admin/courses/.../tests/seed-test-hidden/grading — the Release ▾ menu open with Release grades… and Release correct answers, both unreleased
- [T1] grading/workspace-photo: a seeded "[grading] Photos" hand-in — one photo with a saved stroke and text mark, the Pen · Circle · Arrow · Text tools, Fit / 100% and the thumbnail strip
- [T1] grading/workspace-narrow: 834 px wide — the top bar on two rows and the grade panel folded into one bottom bar (Score, Feedback, Save & next)
- [T2] grading/workspace-narrow-expanded: the same after tapping Feedback — the full grade panel under the answer
- [T1] grading/workspace-done: a seeded "[grading] Done" test whose only hand-in is graded — the finish panel in place of the grade panel, Release… pinned
- [T2] grading/release-dialog: Release… pressed on the finish panel — "Release grades · [grading] Done" with Whole test / Only chosen students; Release is never pressed
- [T1] grading/empty-roster-unbroken-title: a fresh "[grading]" course and test — 0 students ("No students enrolled in this course yet."), title pasted as one unbroken email-like string, long course name
- [T3] grading/grades-released: the same page after Release Grades — the control is simply gone, with no confirmation anywhere

- [skip] grading/hub-all-caught-up: "All caught up." needs zero tests holding a Submitted student; the seed keeps nine on seed-test-visible (page.tsx:133, 170-172)
- [skip] grading/release-grades-success: the "Grades released ✓" message (grading-forms.tsx:481-484) cannot be photographed — the action revalidates the route and the header drops the whole button (grading/[testId]/page.tsx:82-86) before the client success state paints; captured grading/grades-released instead
- [skip] grading/per-student-release: "Release Grade to Student" needs grades withheld AND a fully graded submission; seed-test-visible shows grades immediately and seed-test-hidden has no submissions (release-grade-for-student.tsx:57-61)
- [skip] grading/ai-auto-grade-result: "Auto-grade with AI" posts to the real model (auto-grade-with-ai-button.tsx:62-68) — not mocked here, so it is never clicked
- [skip] grading/student-not-started: a not-started student is a disabled row in the student picker, so her answers never open
- [T3, not captured] grading/by-question-empty: "No questions on this test yet." on the sandbox test — left out for budget, the page is otherwise identical to grading/empty-roster-unbroken-title
