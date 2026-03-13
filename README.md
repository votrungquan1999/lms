# LMS — Learning Management System

A web-based Learning Management System that enables students to login, take tests, and download lesson files. Built with Next.js 16, TypeScript, and Tailwind CSS v4.

## Core Features

### Implemented

- **Admin Login** — Admin signs in via Google OAuth (whitelisted emails only)
- **Student Account Creation** — Admin creates student accounts with username and password
- **Course Management** — Create courses, enroll students, manage tests
- **Test Question Management** — Add questions with markdown content, import from JSON
- **Student Course Browsing** — Students view enrolled courses, navigate to tests
- **Test Taking** — Students view questions and submit free-text answers per question (append-only history)
- **Test Grading** — Teacher grades each question (0–100 score, feedback, optional per-student solution); auto-averaged test total
- **Test Status** — Derived status per student: not started, in progress, submitted, graded

- **Diff-Based Answer Comparison** — GitHub-style side-by-side diff of student answers vs provided solutions (`react-diff-viewer-continued`)

### Planned

- **Lesson File Downloads** — Students download lesson materials (PDFs, documents, etc.)

## Tech Stack

| Technology                                   | Version | Purpose                      |
| -------------------------------------------- | ------- | ---------------------------- |
| [Next.js](https://nextjs.org)                | 16      | React framework (App Router) |
| [React](https://react.dev)                   | 19      | UI library                   |
| [TypeScript](https://www.typescriptlang.org) | 5       | Type safety                  |
| [Tailwind CSS](https://tailwindcss.com)      | 4       | Utility-first styling        |
| [shadcn/ui](https://ui.shadcn.com)           | —       | UI components                |
| [Better Auth](https://www.better-auth.com)   | 1.5     | Authentication (OAuth, sessions) |
| [MongoDB](https://www.mongodb.com)           | 7       | Database                     |
| [Biome](https://biomejs.dev)                 | 2       | Linting & formatting         |
| pnpm                                         | —       | Package manager              |

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Lint
pnpm lint

# Format
pnpm format
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
src/
  app/            # Next.js App Router pages and layouts
    admin/        # Admin login, dashboard, and course management
      courses/    # Course list, detail, test and question management
    api/auth/     # Better Auth API route handler
  lib/            # Domain services, auth, session, config
  components/ui/  # shadcn UI components
documents/
  features/       # Feature specifications and acceptance criteria
.agent/           # AI agent configurations (workflows, skills, rules)
```

## Feature Documentation

Detailed feature specifications with acceptance criteria are located in [`documents/features/`](./documents/features/).
