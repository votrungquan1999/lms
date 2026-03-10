---
description: Build comprehensive repository knowledge by analyzing codebase and creating interconnected documentation
---

// turbo-all

# Repository Knowledge Workflow

This workflow creates a comprehensive knowledge base for a repository by systematically analyzing the codebase and documenting meaningful patterns, architecture, and flows.

## Usage

Use this workflow when:

- Starting work on a new codebase
- Need to create onboarding documentation
- Planning major architectural changes
- Setting up agent context for a repository

## Steps

1. **Create Repository Knowledge Folder**:
   ```bash
   mkdir -p repo_knowledge
   ```
   This folder will contain all knowledge base markdown files at the root level of the repository.

2. **High-Level Structure**:
   - Analyze directory layout and identify main modules/packages
   - Review `package.json` and understand key dependencies
   - Locate main entry files (main.ts, index.ts, app.tsx, etc.)

3. **Analyze Existing Documentation**:
   - Read `README.md` and extract important, non-obvious information
   - Check for agent rules in common folders:
     - `.cursor/rules/`
     - `.agent/rules/`
     - `.github/copilot-instructions.md`
   - Extract important patterns, conventions, and architectural decisions from these files
   - **Do not copy entire files** - extract only meaningful, non-generic content

4. **Analyze Codebase Structure**:
   - Map out detailed module organization
   - Discover key abstractions and utilities
   - Identify state management approach (if applicable)
   - Document testing patterns and conventions

5. **Identify Key Flows**:
   - Map critical user flows or data flows
   - Document API structure and key endpoints (if backend)
   - Identify component hierarchy and relationships (if frontend)
   - Database schema and data models (if applicable)

6. **Create Interconnected Knowledge Files**:
   
   Create focused markdown files in `repo_knowledge/` folder:
   - `overview.md` - High-level project description and purpose
   - `architecture.md` - System architecture with diagrams
   - `patterns.md` - Code patterns and conventions specific to this repo
   - `flows.md` - Key user flows or data flows
   - `testing.md` - Testing strategy and patterns (if non-obvious)
   
   **Cross-reference between files** to reduce duplication:
   ```markdown
   See [architecture.md](./architecture.md#database-layer) for database details.
   ```

7. **Update Root Agent Files**:
   
   If there are root-level agent files (e.g., `agents.md`, `.cursorrules`, `.github/copilot-instructions.md`), add references to the knowledge base:
   
   ```markdown
   ## Repository Knowledge
   
   For comprehensive understanding of this codebase, refer to:
   - [Overview](./repo_knowledge/overview.md)
   - [Architecture](./repo_knowledge/architecture.md)
   - [Patterns](./repo_knowledge/patterns.md)
   - [Flows](./repo_knowledge/flows.md)
   ```

## Critical Guidelines

**DO:**
- Focus on **non-obvious** patterns and conventions unique to this repo
- Document **meaningful architectural decisions** and the reasoning behind them
- Include **specific examples** of patterns with file references
- Use **mermaid diagrams** for complex architectures or flows
- Cross-reference between knowledge files to avoid duplication
- Extract important content from existing agent rules and documentation

**DO NOT:**
- Include obvious instructions like "Provide helpful error messages" or "Write unit tests"
- List every component or file (easily discoverable through file exploration)
- Include generic development practices (e.g., "Use meaningful variable names")
- Copy sensitive information (API keys, tokens, credentials)
- Make up sections like "Common Development Tasks" or "Tips for Development" unless explicitly documented elsewhere
- Repeat information that's already in another knowledge file

## Example Structure

```
repo_knowledge/
├── overview.md          # What the project does, tech stack, key goals
├── architecture.md      # System design, component relationships, diagrams
├── patterns.md          # Coding patterns, naming conventions, file organization
├── flows.md            # Critical user flows, data flows, API request flows
└── testing.md          # Testing strategy, patterns, mocking conventions
```

## Example Content

### repo_knowledge/overview.md
```markdown
# Project Overview

AI Rules Repository - A platform for managing and distributing AI agent rules, skills, and workflows.

## Tech Stack
- Backend: Node.js, Express, MongoDB
- Frontend: React, TypeScript
- CLI: Commander.js, Inquirer

## Key Goals
- Local-first architecture to avoid GitHub API rate limits
- Support multiple agent platforms (Cursor, Claude-code, Antigravity)
```

### repo_knowledge/patterns.md
```markdown
# Code Patterns

## File Organization

Antigravity artifacts follow a specific structure:
- Rules: `.agent/rules/*.md`
- Skills: `.agent/skills/*/SKILL.md`
- Workflows: `.agent/workflows/*.md`

See [architecture.md](./architecture.md#antigravity-integration) for how these are processed.

## Naming Conventions

- Test files: `*.test.ts` for unit tests, `*.e2e.test.ts` for E2E tests
- API routes: RESTful naming with plural nouns (e.g., `/rules`, `/skills`)
```

## Notes

- Keep knowledge files **concise** - quality over quantity
- Update as the codebase evolves
- Link to specific files using relative paths when helpful
- Use mermaid diagrams for complex relationships
- This knowledge base should make onboarding significantly faster
