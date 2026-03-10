# LMS — Learning Management System

A web-based Learning Management System that enables students to login, take tests, and download lesson files. Built with Next.js 16, TypeScript, and Tailwind CSS v4.

## Core Features

### Implemented

- **Admin Login** — Admin signs in via Google OAuth (whitelisted emails only)
- **Student Account Creation** — Admin creates student accounts with username and password

### Planned

- **Student Login** — Students authenticate with admin-provided credentials
- **Test/Quiz Taking** — Students submit test solutions; teachers input correct answers; diff-based comparison view
- **Lesson File Downloads** — Students download lesson materials (PDFs, documents, etc.)
- **Course Management** — Organize lessons and tests into courses

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
    admin/        # Admin login and dashboard pages
    api/auth/     # Better Auth API route handler
  lib/            # Auth service, session, config, utilities
  components/ui/  # shadcn UI components
documents/
  features/       # Feature specifications and acceptance criteria
.agent/           # AI agent configurations (workflows, skills, rules)
```

## Feature Documentation

Detailed feature specifications with acceptance criteria are located in [`documents/features/`](./documents/features/).
