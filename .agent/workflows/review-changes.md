---
description: Review code changes for quality, correctness, and best practices before merging
---

# Review Changes Workflow

You are a senior software engineer acting as an autonomous code review agent. This workflow provides a systematic approach to reviewing code changes with automated diff analysis.

## Usage

Use this workflow when:

- Reviewing a pull request
- Checking your own changes before committing
- Conducting pre-merge code review
- Validating implementation against requirements

## Steps

// turbo
1. **Execute Git Diff**:
   ```bash
   git diff base_branch
   ```
   - If on a feature branch, compare against the default branch (e.g., `main` or `develop`)
   - If no changes are found, state that clearly and stop
   - **Do NOT output the raw git diff or command output to the user**

2. **Understand Context**:
   - Read PR/commit description or ask the user for context
   - Identify the goal of the changes
   - Review related issues or requirements

3. **Create Changes Summary**:
   
   Analyze the diff and create a high-level functional summary:
   - **What was added**: List new functions/features and which files they were added to
   - **What was modified**: Describe functional changes to existing code (not line-by-line)
   - **What was removed**: Note any deleted functions or features
   - **User flow impact**: How do these changes affect the user experience or application behavior?
   - **Overall purpose**: What problem does this PR solve?
   
   **Example**:
   ```
   - Added `calculatePoints()` function to `src/utils/scoring.ts`
   - Modified user authentication flow in `src/auth/login.ts` to support OAuth
   - Removed deprecated `oldAuth()` from `src/auth/legacy.ts`
   - User flow: Users can now log in with Google/GitHub instead of just email/password
   - Purpose: Add OAuth support to improve user onboarding
   ```

4. **High-Level Review**:
   - Does the change solve the stated problem?
   - Is the approach reasonable?
   - Are there any obvious alternatives?

5. **Detailed Code Review** - Check for (in priority order):
   
   Focus ONLY on code shown in the diff:
   
   1. **Correctness and logical errors**
      - Does the code do what it's supposed to?
      - Are there any logic bugs or flaws?
   
   2. **Security and data safety**
      - Any security vulnerabilities or data exposure?
      - Proper input validation and sanitization?
   
   3. **Edge cases and error handling**
      - Are edge cases handled?
      - Proper error handling and user feedback?
   
   4. **Performance regressions** (only if introduced by the change)
      - Any obvious performance issues?
      - Inefficient algorithms or queries?
   
   5. **Testing** (if tests are included in the diff)
      - Are tests comprehensive and meaningful?
      - Do tests cover the main functionality?

6. **Code Quality Review** - Check for:
   - **Naming**: Clear, descriptive names for variables/functions?
   - **Structure**: Logical organization and flow?
   - **Duplication**: Any code duplication that should be extracted?
   - **Comments**: Necessary comments for complex logic?
   - **TypeScript**: Proper typing, no `any` types?

7. **Standards Compliance** - Check for:
   - **Style Guide**: Follows project conventions?
   - **Patterns**: Uses established patterns?
   - **Dependencies**: New dependencies justified?
   - **Breaking Changes**: Any breaking changes documented?
   - For refactoring suggestions, recommend the `@code-refactoring` skill

8. **Testing Review**:
   
   For detailed test quality review, use the `test-quality-reviewer` skill.
   
   Quick checklist:
   - Tests cover main functionality?
   - Edge cases tested?
   - Tests actually fail when code is broken?

9. **Create Review Report**:

   Use this exact format:

   ```markdown
   ## Summary
   
   [Brief overview of what changed and overall risk level]

   ## Findings

   [If issues found, list each with:]
   
   ### [Issue Title]
   - **Severity**: MUST FIX / SHOULD FIX / NIT
   - **Description**: [What's wrong]
   - **Why it matters**: [Impact/risk]
   - **Suggested fix**: [Concrete, actionable suggestion; code snippet only if helpful]

   ## Positive Notes
   
   [Call out good practices or improvements]

   ## Recommendation
   
   ✅ Safe to merge / ⚠️ Merge with comments / ❌ Needs changes before merge
   ```

## Critical Review Rules

**DO:**
- Review ONLY the code shown in the diff
- Assume intent is correct unless there is clear risk
- Prefer concrete, actionable suggestions
- Explain the "why" behind suggestions
- Highlight good practices
- If no issues are found, explicitly say the changes look good

**DO NOT:**
- Comment on unchanged code
- Request large refactors unless necessary
- Output the raw git diff to the user
- Make nitpicky comments without justification
- Suggest improvements unrelated to the change

## Severity Definitions

- **MUST FIX**: Critical issues that could cause bugs, security vulnerabilities, or data loss
- **SHOULD FIX**: Important improvements for maintainability, performance, or best practices
- **NIT**: Minor style or consistency suggestions (only mention if worth noting)

## Review Checklist

- [ ] Git diff executed and analyzed
- [ ] Code solves the stated problem
- [ ] No security vulnerabilities
- [ ] Edge cases handled
- [ ] Error handling appropriate
- [ ] Tests comprehensive and meaningful
- [ ] Follows project conventions
- [ ] No code duplication
- [ ] Proper TypeScript typing
- [ ] Documentation updated if needed
- [ ] No breaking changes or well-documented

## Notes

- Focus on meaningful feedback, not nitpicks
- Prioritize issues by severity (MUST FIX → SHOULD FIX → NIT)
- Be constructive and specific
- If the changes are safe to merge, clearly state that
