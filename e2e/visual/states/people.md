## people — students (src/app/admin/(dashboard)/students/page.tsx, create-student-dialog.tsx)

- [T1] people/students-list-seeded: 16 accounts in the card grid — the many-items case, with several very long seeded names ("Hank Submitted (MC autograded, free-text pending)")
- [T1] people/create-dialog-blank: Create Student dialog just opened, all three fields empty
- [T1] people/create-submitted-empty: Create Student clicked with every field blank — native `required` blocks the post, so the only feedback is Chromium's own bubble (page.tsx has no client-side error copy)
- [T2] people/create-blank-error: fields filled with spaces only (passes `required` + `minLength`), so the server's "All fields are required" refusal renders in the dialog (actions.ts:44)
- [T1] people/create-duplicate-username: username `alice` (a seeded account) — "Username already exists" (auth-service.ts:139)
- [T1] people/create-success-countdown: success banner plus the auto-close countdown, held at its first value by the frozen clock (create-student-dialog.tsx:110)
- [T1] people/students-long-name: list containing a 71-char full name with spaces (`people-longname`)
- [T1] people/students-unbroken-name: list containing an unbroken email-like name and a 48-char unbroken username (`people-khoahoccoban2026.student.university.edu.vn`)

## people — user roles (src/app/admin/(dashboard)/user-roles/page.tsx, role-action-buttons.tsx)

- [T1] people/user-roles-list: every account that can sign in, with role badge and the grant/revoke control; includes both stress names and their derived `@lms.internal` emails
- [T2] people/user-roles-self-revoke-error: owner clicks "Revoke admin" on their own row — refused inline by the self-demotion guard (actions.ts:142)

## people — join requests (src/app/admin/(dashboard)/join-requests/page.tsx)

- [T1] people/join-requests-caught-up: Waiting tab with nothing seeded — the "All caught up." empty state, pagination hidden
- [T3] people/join-requests-approved-empty: Approved tab — the neutral "No requests match." empty state (a different string from the same page)

## Not captured

- [skip] people/user-roles-truncated: the "Showing first {limit} of {totalCount}" banner needs 101 sign-in accounts; the bound is a constant, not a UI control (user-role-service.ts:30)
- [skip] people/join-requests-rows / pagination: no join request is seeded and nothing on the admin side can create one — a request is only born from the student-side join flow
- [T3, not captured] granting admin to another account: the action really writes to the shared database, so it is not safe to drive from a tour
