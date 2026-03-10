---
name: create-implementation-plan
description: Creates a comprehensive implementation plan with research, design, and file-by-file change breakdown before execution.
---

# Create Implementation Plan

Structured approach to creating a detailed implementation plan for code changes before execution.

## Purpose

Ensures that significant changes are well-researched, clearly documented, and reviewed before implementation begins. Prevents wasted effort from poor planning.

## When to Use This Skill

- Implementing a new feature or significant change
- Planning a refactor or architectural update
- Working on changes that span multiple files or components
- Need to communicate your approach to stakeholders

## Instructions

### Step 1: Research the Codebase

**Goal:** Understand the existing implementation before planning.

Read as many relevant files as possible to understand:
- Existing patterns and conventions in the codebase
- Related features or components that might be affected
- Architecture and structure of the area you'll be modifying
- Testing patterns and utilities already in place
- Types, interfaces, and data models

**Critical: Requirement Clarification First.** If anything is unclear or ambiguous, ask the user clarifying questions. Do not assume implementation details, architectural decisions, or requirements.

When researching external libraries or APIs, use `@context7` for documentation queries and `@web-search` for broader research.

**Mandatory Checkpoint:** Report how many files you read and ask the user whether to:
- Read more files
- Ask more questions
- Continue to planning

**Do not proceed to Step 2 until the user explicitly says "continue".**

### Step 2: Analyze Requirements

- Clarify the goal and success criteria
- Identify edge cases and constraints
- Determine scope boundaries (what's in/out of scope)
- List assumptions and unknowns
- Identify dependencies (external APIs, libraries, other features)

### Step 3: Design the Approach

- Choose the implementation strategy
- Consider alternative approaches and trade-offs
- Identify architectural patterns to use
- Plan data models and interfaces
- Determine error handling strategy

For complex designs, consider using the `@structured-brainstorming` workflow to explore alternatives.

### Step 4: Identify Breaking Changes & Review Requirements

- List any breaking changes (API, config, behavior)
- Identify significant design decisions that need user input
- Note areas of uncertainty or risk
- Use GitHub alerts (`IMPORTANT`/`WARNING`/`CAUTION`) for critical items

### Step 5: Create File-by-File Plan

Group files by component or logical area. For each file:
- **[NEW]** files: What will be created and why
- **[MODIFY]** files: What changes and why
- **[DELETE]** files: What will be removed and why

Link to files using markdown: `[filename](file:///absolute/path)`

**Group by component** and **order logically** (dependencies first).

### Step 6: Plan Verification

Document how you'll verify the changes:
- **Automated Tests**: What tests you'll write or run
- **Manual Verification**: What you'll test manually
- **Browser/UI Testing**: If applicable, what flows to test

### Step 7: Write the Plan Document

Write to `<appDataDir>/brain/<conversation-id>/implementation_plan.md` using this format:

```markdown
# [Goal Description]

Brief description of the problem and what the change accomplishes.

## User Review Required

> [!IMPORTANT]
> [Critical decision or breaking change that needs approval]

## Proposed Changes

### [Component Name]

#### [MODIFY] [filename](file:///absolute/path)
- Change 1: Description
- Change 2: Description

#### [NEW] [filename](file:///absolute/path)
- Purpose and contents

---

## Verification Plan

### Automated Tests
- Run `npm test` to verify
- Add tests for [specific feature]

### Manual Verification
- Test user flow: [describe flow]
```

### Step 8: Request Review

**MUST pause for user review.** Use `notify_user` to request approval before any implementation begins.

---

## Best Practices

- ✅ Be specific about what changes and why
- ✅ Group files logically by component
- ✅ Include file links for easy navigation
- ✅ Document verification strategy upfront
- ✅ Highlight breaking changes and design decisions
- ✅ Use mermaid diagrams for complex architecture
- ❌ Don't create vague plans without specifics
- ❌ Don't skip the research phase
- ❌ Don't plan without a verification strategy

## Related Skills

- `@structured-brainstorming` - Use for complex design decisions during Step 3
