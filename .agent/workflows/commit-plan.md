---
description: Create a semantic commit plan by analyzing git changes and grouping them logically
---

# Commit Plan Workflow

This workflow helps create a well-structured commit plan by analyzing your current git changes and grouping them into semantic commits with detailed descriptions.

## Usage

Use this workflow when you have uncommitted changes and want to create a clean commit history with semantic commit messages.

## Steps

// turbo
1. **Analyze Changes**: Run `git status --short` to see all modified files

// turbo
2. **View Change Summary**: Run `git diff --stat` to see change summary

// turbo
3. **Understand Key Changes**: For important modified files, run `git diff --no-ext-diff <file>` to see actual changes
   - Focus on files that are central to understanding the scope of work
   - Read 2-3 key files to understand the nature of changes

4. **Read File Contents**: Use `view_file` or similar tools to read modified files directly
   - This helps understand the full context of changes
   - Important for writing accurate commit descriptions
   - Focus on new files and significantly modified files

5. **Group Changes**: Analyze all information and group related changes into logical commits based on:
   - **feat**: New feature or capability
   - **fix**: Bug fix
   - **docs**: Documentation changes
   - **style**: Formatting, missing semicolons, etc.
   - **refactor**: Code restructuring without behavior change
   - **test**: Adding or modifying tests
   - **chore**: Maintenance tasks (deps, config, tooling)

6. **Create Commit Plan**: For each group, create a commit with:
   - **Title**: Semantic prefix + scope (optional) + concise summary (50 chars or less)
   - **Description**: Multi-line explanation of what changed and why (wrap at 72 chars)
   - **Files**: List of all files to include in this commit
   
   **CRITICAL**: Each file can only appear in ONE commit (no partial staging)

7. **Present Plan**: Show the complete commit plan to the user for review
   - Include both title and description for each commit
   - List all files clearly
   - Wait for user approval before proceeding

8. **Execute**: After approval, for each commit run:
   ```bash
   git add <file1> <file2> ... && git commit -m "<title>
   
   <description paragraph>
   
   - <bullet point 1>
   - <bullet point 2>
   - <bullet point 3>"
   ```
   - Use `&&` to combine add and commit in one command
   - Use single `-m` with multi-line string (title + blank line + description + blank line + bullets)
   - This keeps commits trackable and allows user to see progress

## Example Output

```markdown
## Commit Plan

### Commit 1: feat(workflows): Add workflows repository and infrastructure

**Description**: 
Implement workflows support infrastructure including repository layer, types, 
and database collection. This adds WorkflowFile and StoredWorkflowsDocument 
interfaces, following the same pattern as skills repository for consistency.

**Files**:
- src/server/types.ts
- src/server/workflows-repository.ts

**Command**:
```bash
git add src/server/types.ts src/server/workflows-repository.ts && git commit -m "feat(workflows): Add workflows repository and infrastructure

Implement workflows support infrastructure including repository layer, types, and database collection. This adds WorkflowFile and StoredWorkflowsDocument interfaces, following the same pattern as skills repository for consistency.

- Add WorkflowFile interface for workflow file structure
- Add StoredWorkflowsDocument for MongoDB storage
- Add WORKFLOWS_COLLECTION_NAME constant
- Follow same patterns as existing skills repository"
```

---

### Commit 2: test(workflows): Add comprehensive test coverage

**Description**:
Add unit and E2E tests for workflows functionality across all agents.
Includes workflows-repository tests and agent-specific installation tests
for Antigravity, Claude Code, and Cursor.

**Files**:
- tests/lib/workflows-repository.test.ts
- tests/e2e/antigravity-installation.test.ts
- tests/e2e/claude-code-installation.test.ts
- tests/e2e/cursor-installation.test.ts

**Command**:
```bash
git add tests/lib/workflows-repository.test.ts tests/e2e/antigravity-installation.test.ts tests/e2e/claude-code-installation.test.ts tests/e2e/cursor-installation.test.ts && git commit -m "test(workflows): Add comprehensive test coverage

Add unit and E2E tests for workflows functionality across all agents. Includes workflows-repository tests and agent-specific installation tests for Antigravity, Claude Code, and Cursor.

- Add workflows-repository unit tests
- Add Antigravity installation E2E test
- Add Claude Code installation E2E test
- Add Cursor installation E2E test"
```
```

## Key Principles

- **Deep Understanding**: Actually read files and diffs, don't just skim filenames
- **One File, One Commit**: Each file appears in exactly one commit (no partial staging)
- **Multi-line Messages**: Always include both title and description
- **Atomic Commits**: Each commit should be a complete, logical unit of work
- **Review First**: NEVER commit without user approval
- **Batch Execution**: Use `&&` to combine add and commit for tracking
- **Conventional Format**: Follow semantic commit conventions strictly

## Notes

- Never commit artifacts, generated files, or `node_modules`
- Keep each commit focused on one logical change
- Title should be concise (≤50 chars), description can be detailed
- Present the complete plan with commands ready to execute
- After approval, execute commands sequentially (one at a time)

## Related

- Consider running the `review-changes` workflow before creating a commit plan to catch issues early
