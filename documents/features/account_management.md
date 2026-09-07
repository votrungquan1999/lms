# Account Management

## Overview
Admin-managed student account lifecycle using **Better Auth** with **Google OAuth** support. Administrators create and update student accounts, but that is no longer the only way an account is created — a prospective student can self-register through a per-course invite link, with either username/password or Google (see [Course Join Requests](course_join_requests.md)). Students still cannot change their own passwords.

## Authentication Provider
- **Library**: [Better Auth](https://www.better-auth.com/)
- **Methods**: Google OAuth (admin login, and student self-signup via invite link), username/password (admin-created students, and student self-signup via invite link)
- **Roles**: Admin, Student — a `role` field recorded on the Better Auth user document (`src/lib/session.ts`), never inferred from email address or sign-in method. Signing in with Google used to imply admin; that inference was a privilege-escalation hole and has since been closed (`src/lib/auth-service.ts`).

## User Roles
- **Admin**: a recorded `role: admin`. Full CRUD on student accounts, login via Google. A stricter **owner** tier — an admin whose email is also in `ADMIN_EMAILS` — is required to grant or revoke admin access (`src/lib/page-guard.ts`); everyday admin actions need only the recorded role.
- **Student**: created by an admin, or by self-registering through a course invite link. Logs in with whichever credential created the account — username/password or Google; still no self-service password change.

## Acceptance Criteria

### Authentication
- [x] Better Auth is configured with Google OAuth provider
- [x] Admin can login via Google account
- [x] Student can login with username and password created by admin
- [x] Invalid credentials show an error message
- [x] Successful login redirects to the appropriate dashboard (admin or student)

### Admin — Create Student Account
- [x] Admin can create a new student account with username and password
- [ ] Admin can link a Google account to a student profile
- [x] System prevents duplicate usernames
- [x] Admin sees confirmation after successful creation

### Admin — Update Student Account
- [ ] Admin can view a list of all student accounts
- [ ] Admin can update a student's password
- [ ] Admin can update a student's profile information (name, etc.)

### Student — Session
- [ ] Authenticated students can access protected pages
- [x] Unauthenticated users are redirected to the login page
- [ ] Session persists across page refreshes

## E2E Test Coverage Needed

The following scenarios require **Playwright e2e tests** for full coverage:
- Admin login flow: Google OAuth → redirect to dashboard
- Student creation form submission: fill form → submit → see success/error message
- Non-admin Google sign-in → rejected with error
- Unauthenticated access to `/admin/dashboard` → redirect to login
