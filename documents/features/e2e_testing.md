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
- `e2e/lms-flow.test.ts` — Main sequential test suite (13 tests, ~40s)

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
- [x] Admin can create a test and add free-text questions
- [x] Admin can create a single-select MC question via the sidebar type picker and options builder
- [x] Admin can grade student submissions (score, feedback, solution) — scoped per question

### Student Flows

- [x] Student can log in and see enrolled courses
- [x] Student can navigate to a course by clicking
- [x] Student can navigate to a test and view questions
- [x] Student can submit a free-text answer
- [x] Student can select a radio button for a single-select MC question and submit
- [x] Student can submit test for grading (with confirmation dialog)
- [x] Student sees "submitted — waiting to be graded" immediately after submission (atomic reveal)
- [x] Student can view their weighted average score after all questions are graded

### Multiple Choice Flows

- [x] Admin can create a single-select question with options via sidebar UI
- [ ] Admin can create a multi-select question with options (UI implemented; no dedicated e2e test yet)
- [x] Student can select and submit an MC answer (radio buttons)
- [x] Auto-graded score is unlocked after all questions (including free-text) are graded (atomic reveal)

## Test Sequence (`lms-flow.test.ts`)

Tests run serially and share state — each test builds on the previous:

| # | Test | Role |
|---|------|------|
| 1 | Admin can create a student | Admin |
| 2 | Student can log in | Student |
| 3 | Admin can create a course | Admin |
| 4 | Admin can enroll a student | Admin |
| 5 | Admin can view enrolled students | Admin |
| 6 | Student sees enrolled course on dashboard | Student |
| 7 | Student can click into course detail | Student |
| 8 | Admin can create a test in a course | Admin |
| 9 | Admin can add a free-text question to a test | Admin |
| 10 | Admin can create a single-select MC question via sidebar UI | Admin |
| 11 | Student answers Q1 (free-text) + Q2 (MC), submits test | Student |
| 12 | Admin grades Q1 (Q2 was auto-graded on submission) | Admin |
| 13 | Student sees weighted average score (atomic reveal unlocked) | Student |

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
