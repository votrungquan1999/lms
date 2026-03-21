---
description: Guides feature implementation using task-driven incremental development with test-first approach. Use when implementing features, building functionality, or starting new development tasks.
---

# Feature Development Workflow

Structured approach for implementing features using context-first research, planning, and BDD-style test-first development.

## Core Principles

1. **Understand Context First** - Read as many relevant files as possible before planning or writing any code
2. **Plan Before Code** - Use `@create-implementation-plan` skill to create a plan before implementation
3. **One Step at a Time** - Create one step, complete it, evaluate, then create the next step
4. **Test-First** - Every step must have tests written before implementation (red-green-refactor)
5. **BDD by Default** - Use Given/When/Then scenarios for most feature behavior; TDD only for internal logic
6. **Quality Gates** - Run quality checkpoints after every 2-3 completed steps

---

## Phase 1: Understand Context

Before planning or writing any code, read as many relevant files as possible to understand:

- Existing patterns and conventions in the codebase
- Related features or components that might be affected
- Architecture and structure of the area you'll be modifying
- Testing patterns and utilities already in place
- Types, interfaces, and data models

**Critical: Requirement Clarification First.** If anything is unclear or ambiguous, ask the user clarifying questions. Do not assume implementation details, architectural decisions, or requirements.

When researching external libraries or APIs, use `@context7` for documentation queries and `@web-search` for broader research.

**Mandatory Checkpoint:** Report how many files you read and ask the user whether to read more files, ask more questions, or continue. Do not proceed until the user explicitly says "continue".

---

## Phase 2: Plan

**Use the `@create-implementation-plan` skill** to create a detailed plan based on the context you've gathered.

The skill will guide you through designing the approach and creating a file-by-file change breakdown.

**After the plan is approved**, proceed to Phase 3.

---

## Phase 3: Implement

Each step is an **observable behavior** — something a user or system can observe, not an internal implementation detail.

### Step Format

**Each step title describes what the system does**, not what code to write:
- ✅ `High-engagement open markets appear as "TRENDING"`
- ✅ `No duplicate markets between trending and regular`
- ❌ `Add isTrending field to Market model`
- ❌ `Write SQL query for trending markets`

**Sub-items track progress within the step:**
- **Test → Implement → Verify** — when production code changes are needed
- **Test → Verify (no production change needed)** — when existing code already handles the behavior
- **Cleanup steps** can have multiple sub-items (e.g., remove old code, rewrite tests, delete dead helpers)

### How to Work Through Steps

**Create one step at a time.** After completing a step, evaluate what you learned and decide the next step. At most, create two steps upfront only if they are very closely related.

**For each step:**

1. **Write the test** describing the behavior (Given/When/Then)
2. **🚫 GATE: Run the test** — check `package.json` scripts for existing test commands (e.g., `npm test`). Use the project's defined command. You MUST see the result before writing any implementation.
   - If it **fails** → proceed to step 3
   - If it **passes** → behavior is already covered, skip step 3, mark done
3. **Implement** the minimum code to make the test pass, then **run the test again** to confirm
4. **Mark the step done** and evaluate — decide what the next step should be based on what you learned

### Quality Checkpoints

**After every 2-3 completed steps**, pause and:

1. **Use `@test-quality-reviewer`** — Review tests against the 4 Pillars framework
2. **Use `@code-refactoring`** — Review for refactoring opportunities (stops if tests are missing)

### When Writing Tests

Before writing any tests, locate the "4 Pillars of Testing" document in the project (usually in `.cursor/rules/`, `docs/`, or `repo_knowledge/`). If you cannot find it, **STOP** and ask the user.

---

## Task File

**Before starting implementation, create a task file** listing all test-first behaviors. Each step tracks the full cycle: write test → run → implement → run.

### Example

```markdown
## Implementation (each step = one test-first cycle)

### Step 1: High-engagement open markets appear as "TRENDING"
- [x] Write test
- [x] Run test (Red — fails as expected)
- [x] Implement minimum code
- [x] Run test (Green — passes)

### Step 2: Low-engagement markets are NOT trending
- [x] Write test
- [x] Run test (Green — already covered by step 1 implementation)

### Step 3: At most sampleSize trending markets returned
- [x] Write test
- [x] Run test (Green — already covered)

### Quality Checkpoint (after steps 1-3)
- [x] test-quality-reviewer: reviewed 3 tests
- [x] code-refactoring: no changes needed

### Step 4: No duplicate markets between trending and regular
- [x] Write test
- [x] Run test (Red)
- [x] Implement deduplication logic
- [x] Run test (Green)

### Step 5: → 🔄 [Next observable behavior]
- [ ] Write test
- [ ] Run test
- [ ] Implement (if needed)
- [ ] Run test (if implemented)
```

---

## What to Avoid

- ❌ Skipping tests for any step
- ❌ Moving to next step with failing tests
- ❌ Writing step titles as code tasks instead of observable behaviors
- ❌ Creating all steps upfront — evaluate after each step
- ❌ Skipping quality checkpoints after 2-3 steps
- ❌ Implementing without a plan (use `@create-implementation-plan` first)
- ❌ Writing implementation code before running the test
- ❌ Batching multiple test-write-implement cycles without running tests between them
