# Course Join Requests

## Overview

An admin shares a per-course invite link. Anyone who opens it can create their own account — username/password or Google — or, if already a student, ask to join without registering again. Every path files a join request that waits for an admin, who can approve or reject it from the queue — see [Not built yet](#not-built-yet) for what's still missing.

## User Roles

- **Admin**: a recorded fact on the account (`user.role`), never inferred from email or sign-in method. Can manage a course's invite link and view the join-request queue.
- **Owner**: a stricter tier — an admin whose email is also in `ADMIN_EMAILS`. Only an owner can grant/revoke admin access; everything else an admin does needs only the recorded role.
- **Prospective student**: no account yet, arriving via an invite link.
- **Student**: created via self-signup, Google, or admin creation; may be enrolled or still pending.

## Role is recorded, not inferred

`Role` (`src/lib/session.ts`: `Admin` | `Student`) is read off the Better Auth `user` document by `AuthService.classify()` — this replaced an earlier design where signing in with Google was itself treated as admin. The field is declared `input: false` in `createBetterAuth`'s `additionalFields` (`src/lib/auth-service.ts`), so a signup body cannot set its own role; it always lands as `Student`.

Two tiers sit on top (`src/lib/page-guard.ts`):
- `requireAdminLogin()` — any recorded Admin.
- `requireRoleManagerLogin()` — a recorded Admin **and** an email in `ADMIN_EMAILS` (`authService.isAdminEmail`). This gates `/admin/user-roles` and its `grantAdminAction`/`revokeAdminAction`, which re-check ownership themselves rather than trust the page guard. An owner cannot revoke their own admin access.

### Rolling this out locks existing admins out until they are backfilled

`classify()` admits an admin on the recorded role alone, and both tiers above sit *behind* an established `AdminSession` — so `ADMIN_EMAILS` cannot bootstrap anyone back in. Every account created before the field existed resolves to no session at all and loses `/admin`.

`scripts/backfill-user-roles.ts` closes that gap: `@lms.internal` addresses become students, real addresses become admins. Deploy first, then backfill — the script promotes every roleless account, so against an older build it would sweep up new signups (still roleless there) alongside the real backlog. It is scoped to `{ role: { $exists: false } }` and is not a re-runnable sweep.

Run it report-only first; the "real address becomes admin" rule promotes anything that had slipped through, which may be more accounts than expected. Applied to production on 2026-09-10: 8 roleless accounts, 6 to student and 2 to admin.

## The invite link

`CourseService` (`src/lib/course-service.ts`) stores one `inviteToken` per course:
- `getOrCreateInviteToken` — mints on first request, stable after that.
- `regenerateInviteToken` — swaps in a new token; the old one stops resolving.
- `disableInviteToken` — clears it back to `null`, indistinguishable from "never minted."
- `findByInviteToken` — the only lookup `/join/[token]` uses. Invalid, revoked, and unknown tokens all resolve to `null`, rendered as the same generic "no longer valid" message — no oracle for whether the course even exists.

## Joining a course

`/join/[token]` (`src/app/join/[token]/page.tsx`) branches on who's asking:

- **Nobody signed in** — a self-signup form (username + password) or a Google button.
- **Username/password** (`joinSignupAction`) — `AuthService.registerStudent` creates the account, then a `CourseJoinRequest` is written. A taken username is rejected pointing back at the original sign-in method, not "pick another name."
- **Google** — `provisionGoogleStudent` (`src/lib/google-student-provisioner.ts`) derives a username from the email's local part. Valid and free: account + join request created in one pass. Colliding or underivable: the person keeps their Google session and picks their own username instead (`googleUsernameSignupAction`) — never auto-suffixed, never refused outright.
- **Already a student** — a "request to join" button instead of a signup form (`requestToJoinAction`). Already enrolled or already pending is reported directly, not queued as a duplicate.

Every path writes through `CourseJoinRequestService.createRequest` (`src/lib/course-join-request-service.ts`), which pre-checks for an existing pending request first.

## The partial unique index

`ensureIndexes` (`src/lib/database.ts`) creates a unique index on `{ courseId, studentId }` scoped with `partialFilterExpression: { status: "pending" }`. It must be partial, not plain: a plain unique index would treat any past request — including a rejected one — as permanently occupying that slot, blocking the student from ever asking again, which is explicitly allowed. Scoping to `status: pending` means only one *waiting* request per pair can exist; resolved rows never block a fresh one. `createRequest` also catches the resulting duplicate-key error (code `11000`) and reads back the winning row, so a race between two concurrent submits collapses into one request instead of a crash.

## The admin queue

`/admin/join-requests` (`src/app/admin/(dashboard)/join-requests/page.tsx`) lists one status at a time — Waiting, Approved, Rejected — via `CourseJoinRequestService.listByStatus`. Waiting sorts oldest-first; resolved statuses sort newest-first. Pagination is real (page navigation with a total, not a truncating cap) and clamps a stale page back into range. A row whose student or course no longer resolves is dropped, not shown as a placeholder — every visible row stays actionable. The page total counts only those visible rows, so the pager can never contradict the list; this is deliberate and costs an unbounded read, because the whole matching set must be resolved before it can be counted. Sorting carries `_id` as a tiebreaker so tied timestamps cannot make a row repeat or vanish between pages, and a compound `{status, requestedAt, _id}` index keeps the read from becoming a collection scan. The row is a card showing name, username and course, with Approve and Reject buttons. Both actions re-check admin authorization **themselves** rather than relying on the dashboard layout's guard, because a server action is a separate endpoint that can be POSTed to directly without ever rendering that layout. Approve CLAIMS the request first and writes the enrollment second. The claim is a compare-and-set (`updateOne({id, status: pending})`), so of two admins acting at once exactly one wins — without it, one could approve while the other rejected, leaving the student enrolled on a rejected request, which nothing could repair since reject never touches enrollments. There are no transactions here, so a crash between the claim and the enrollment leaves an approved-but-not-enrolled row; re-approving such a row is therefore allowed and simply re-runs the idempotent enrollment, writing nothing new. A rejected row still refuses outright. A unique index on `enrollment` `{courseId, studentId}` stops two concurrent approvals inserting a duplicate roster entry. Reject is status-only; an enrollment the student already holds by another path is deliberately left untouched, so a queue action can never silently revoke access an admin granted elsewhere.

## Acceptance Criteria

### Admin — Invite Links
- [x] Get a shareable join link for a course
- [x] Regenerate the link, invalidating the previous one
- [x] Disable the link entirely

### Prospective Student — Joining
- [x] A valid link shows which course it invites to
- [x] An invalid/revoked link shows a generic "no longer valid" message
- [x] Self-register with username + password
- [x] Self-register with Google, with a fallback username form on collision
- [x] An existing account is pointed back to its original sign-in method, never given a second account
- [x] An already-signed-in student can request to join without registering again
- [x] Already enrolled / already pending is reported instead of a duplicate request
- [x] Concurrent submits for the same course+student never create two pending requests

### Admin — Join Request Queue
- [x] See every waiting request with who is asking and which course
- [x] Filter between Waiting / Approved / Rejected
- [x] Page through a long queue
- [x] Reach the queue from the sidebar navigation
- [x] Approve a request (enrolls the student)
- [x] Reject a request (student keeps their account, stays unenrolled)
- [x] A resolved request cannot be approved/rejected a second time
- [x] An interrupted approval can be safely retried

### Student — Awaiting Approval
- [x] A pending student sees that state on their dashboard instead of just an empty course list

## Known limits

All planned behaviors are built, as of 2026-09-08. Two limits are deliberate rather than unfinished:

- **The queue's total is exact but unbounded.** Counting only rows an admin can actually see means resolving the whole matching set on every page view, so pagination bounds what is rendered, not the work done. Chosen knowingly over an approximate total; revisit with referential cleanup or a denormalized count, not more paging.
- **Public self-registration is not rate-limited.** Password hashing is deliberately memory-hard, so an unauthenticated caller can conscript server CPU. Accepted for now and tracked separately.

Verified end to end by `e2e/course-join-request-flow.test.ts`, which drives the whole path in a browser that was never logged in: invite link, registration, join request, admin approval, enrolled course.
