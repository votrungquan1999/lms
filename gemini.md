# LMS — Project Context for AI Agents

## Project Overview

This is a **Learning Management System (LMS)** built with Next.js 16, TypeScript, and Tailwind CSS v4. It enables students to login, take tests (with diff-based solution comparison), and download lesson files. Admins manage student accounts and course content.

## Key Rules for Agents

1. **Always update `README.md`** when features are added, modified, or removed — keep the "Core Features" section in sync with the actual state of the project.
2. **Refer to `.agent/`** for agent configurations including workflows, skills, and rules.
3. **Feature documentation** lives in `documents/features/` — update the relevant feature doc when making changes to a feature.

## Agent Configurations

- **Rules**: `.agent/rules/` — coding conventions, architecture patterns, testing guidelines
- **Skills**: `.agent/skills/` — specialized capabilities (TDD, BDD, code refactoring, etc.)
- **Workflows**: `.agent/workflows/` — step-by-step processes (feature development, commit planning, etc.)

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **Linting/Formatting**: Biome 2
- **Package Manager**: pnpm
