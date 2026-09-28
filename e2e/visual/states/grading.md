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
