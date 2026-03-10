# Account Management

## Overview
Admin-managed student account lifecycle using **Better Auth** with **Google OAuth** support. Administrators create and update student accounts. Both admins and students can log in via Google or email/password credentials. Students cannot self-register or change their own passwords.

## Authentication Provider
- **Library**: [Better Auth](https://www.better-auth.com/)
- **Methods**: Google OAuth (admin only), username/password (students)
- **Roles**: Admin, Student

## User Roles
- **Admin**: Full CRUD on student accounts, login via Google
- **Student**: Login via username/password only (no self-service account management)

## Acceptance Criteria

### Authentication
- [x] Better Auth is configured with Google OAuth provider
- [x] Admin can login via Google account
- [ ] Student can login with username and password created by admin
- [ ] Invalid credentials show an error message
- [ ] Successful login redirects to the appropriate dashboard (admin or student)

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
