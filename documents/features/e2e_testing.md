# E2E Testing

## Overview

End-to-end tests using Playwright to verify full user flows through the browser. Tests cover critical paths for both admin and student roles, ensuring the UI, server actions, and database work together correctly.

## Tech Stack

- **Framework**: Playwright (`@playwright/test`)
- **Script**: `pnpm test:e2e`
- **Dev server**: Next.js on port 3001 with `MONGODB_URI=mongodb://localhost:27017/lms_e2e`
- **Database**: Isolated `lms_e2e` MongoDB database, cleared on each test run

## Key Files

- `playwright.config.ts` — Config with `e2e-flow` project, serial mode, web server auto-start
- `e2e/global-setup.ts` — Drops all collections in `lms_e2e` before each run
- `e2e/auth.setup.ts` — Seeds admin account via Better Auth API (bypasses Google OAuth)
- `e2e/lms-flow.test.ts` — Main sequential test suite (12 tests, ~35s)

## Acceptance Criteria

### Infrastructure

- [x] Playwright config is set up (`playwright.config.ts`)
- [x] E2E tests use an isolated test database (separate from dev)
- [x] Tests seed admin account before running via auth setup
- [ ] CI pipeline runs e2e tests after unit/integration tests pass

### Admin Flows

- [x] Admin can log in (auth setup via API)
- [x] Admin can create a student with name/username/password
- [x] Admin can create a course with title and description
- [x] Admin can enroll students in a course
- [x] Admin can create a test and add questions
- [x] Admin can grade student submissions (score, feedback, solution)

### Student Flows

- [x] Student can log in and see enrolled courses
- [x] Student can navigate to a course by clicking
- [x] Student can navigate to a test and view questions
- [x] Student can submit answers to questions
- [x] Student can submit test for grading (with confirmation dialog)
- [x] Student can view their grades and feedback after grading

### Multiple Choice Flows (after MC feature is implemented)

- [ ] Admin can create a single-select question with options
- [ ] Admin can create a multi-select question with options
- [ ] Student can select and submit answer(s) for MC questions
- [ ] Auto-graded score is displayed correctly after submission

## Architecture

```
e2e/
├── auth.setup.ts          # Admin auth via API (setup project)
├── global-setup.ts        # DB cleanup
├── lms-flow.test.ts       # Main sequential flow
playwright/
└── .auth/
    ├── admin.json          # Admin storage state (from auth setup)
    └── student.json        # Student storage state (created mid-flow)
```

### Auth Strategy

- **Admin**: Seeded via Better Auth `signUpEmail` API in `auth.setup.ts`, storage state saved to `playwright/.auth/admin.json`
- **Student**: Created via admin UI, authenticates via login form mid-flow, storage state saved to `playwright/.auth/student.json`
- Student tests use `browser.newContext({ storageState })` to avoid re-login
