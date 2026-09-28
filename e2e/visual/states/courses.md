# courses

Routes: `src/app/admin/(dashboard)/courses/page.tsx`,
`src/app/admin/(dashboard)/courses/[courseId]/page.tsx`,
`src/app/admin/(dashboard)/courses/[courseId]/results-report/page.tsx`

## Captured

- [T1] courses/list: every course — the seeded one, a long spaced title, an unbroken email-like title, and one with no description (page.tsx:32)
- [T1] courses/create-dialog-blank: the Create Course dialog just opened, both fields empty
- [T2] courses/create-invalid: Create submitted with a whitespace-only title — the action's "Course title is required" alert (actions.ts:11)
- [T1] courses/detail-seeded: seeded course detail — 16 enrolled students, 2 tests with per-status counts, join-link panel, materials
- [T1] courses/detail-empty: a freshly created course — no students, no materials, no tests, no join link yet
- [T1] courses/detail-long-title: detail + breadcrumb of a course whose title is a long name with spaces
- [T1] courses/detail-unbroken-title: detail + breadcrumb of a course titled with one unbroken email-like string, description an unbroken URL
- [T1] courses/enrollments-dialog: Manage Enrollments on the seeded course — 16 students, all pre-ticked, list clipped at max-h-[80vh]
- [T2] courses/enrollments-none-ticked: the same dialog on a course with nobody enrolled — 16 students, none ticked
- [T1] courses/results-report: Export Results for the seeded course — 16 student radios, 2 test checkboxes, Export PDF disabled
- [T1] courses/results-report-selected: one student and one test picked, Export PDF enabled
- [T2] courses/results-report-empty: Export Results for a course with no students and no tests — two headings with nothing under them and a dead Export button

## Not captured

- [skip] courses/list-empty: the "No courses yet" branch (page.tsx:57) needs an empty course collection; the seeded course is shared and must not be deleted
- [skip] courses/create-success: the dialog's success banner (create-course-form.tsx:69) only renders right after a create, so capturing it would add a throwaway course to the shared list on every run
- [skip] courses/detail-not-found: notFound() (\[courseId\]/page.tsx:48) renders Next's built-in 404 — there is no custom not-found.tsx anywhere under src/app, so nothing course-specific to review
- [skip] courses/enrollments-no-students: "No students found" (enroll-student-form.tsx:132) needs zero students in the shared seeded database
