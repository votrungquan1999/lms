---
name: orchestrated-feature-dev
description: Orchestrated feature development with sub-agent phases, quality gate loops, and structured pipeline. Use when asked for "orchestrated development", "structured feature build", "deep feature workflow", or "full development pipeline".
---

# Orchestrated Feature Development

A structured workflow that orchestrates specialized node phases through a pipeline with quality gate loops. **Parallel and isolation-critical phases** (research, investigation, validation, quality-gate) run as sub-agents with isolated context. **The sequential implementation loop (TDD steps) runs in the main session** to avoid wasting tokens re-reading the same files on every step.

## How This Works

This skill acts as an **orchestrator** — it spawns sub-agents for the phases that benefit from isolation or parallelism, runs the TDD loop inline (since each step shares heavy context with the previous one), and passes data between phases via project-local files.

```
[research] → [plan] → [investigation (parallel)] → [tdd-step] ↔ [quality-gate] → [validation (parallel)] → [summary]
                              ↑                         ↑              |
                              fix plan if needed         └── loop back ──┘
```

## Orchestrator Rules

The main session:
- **Spawns sub-agents** for research, planning, investigation (parallel), quality-gate, and validation (parallel) — these benefit from isolated context or parallelism
- **Runs the TDD step loop inline** — each step shares heavy context (same plan, same files, same patterns) with the previous one, so isolating each step wastes tokens on re-reading. The investigation phase already produced curated per-step context in `INVESTIGATION_STEP_[N].md`.
- **Reads state files** to make routing decisions and to drive the TDD loop
- **Presents sub-agent outputs** to the user by reading and relaying their output files
- **Fixes state files** when investigation reveals plan issues (update `PLAN_STEPS.md` and `implementation-plan.md`)

The main session MUST NOT:
- Perform research, planning, investigation, validation, or quality review itself — always delegate to sub-agents for those
- Analyze or summarize research findings in its own words
- Make independent judgment calls about code quality — delegate to the quality-gate sub-agent

## Sub-Agent Architecture

Each phase runs as a sub-agent spawned via the `Agent` tool. This provides:
- **Isolated context** — each phase gets a clean context window, preventing bloat
- **Focused execution** — sub-agents only see their node instructions and relevant state files
- **Clean summaries** — only the results are returned to the orchestrator

**How to spawn a phase sub-agent:**

Use the `Agent` tool with the following pattern:
```
Agent(
  description: "[phase name] - [brief]",
  prompt: "Read the instructions in [path to node file] and execute them.
    [Additional context: user request, relevant state files to read, etc.]
    When done, report: [what the orchestrator needs to know]"
)
```

The sub-agent will execute the node instructions and return a summary. The orchestrator then reads the state files and makes routing decisions.

## State Files Convention

All workflow state is tracked in project-local files (add to `.gitignore`):

- `RESEARCH_OUTPUT.md` — Research findings (written by research node)
- `PLAN_STEPS.md` — Step list with affected files and dependencies (written by plan node)
- `implementation-plan.md` — Full implementation plan (written by plan node)
- `IMPLEMENTATION_PROGRESS.md` — Progress tracking with test results (written by TDD step node)
- `INVESTIGATION_STEP_[N].md` — Per-step investigation findings (written by investigation nodes)
- `VALIDATION_STEP_[N].md` — Per-step validation results (written by validation nodes)

---

## Phase 1: Research

**Spawn a sub-agent** to run the research phase:

```
Agent(
  description: "Research phase",
  prompt: "Read the instructions in [this skill's directory]/nodes/node-research.md
    and execute them for the following feature request: [user's request].
    Write findings to RESEARCH_OUTPUT.md in the project root.
    Report back: number of files read, key patterns found, affected areas."
)
```

**After the sub-agent returns**, read `RESEARCH_OUTPUT.md` and present findings to the user.

**Gate:** Ask the user: "Research complete. Continue to planning, or investigate more?"
- If "more" → spawn another research sub-agent with expanded scope
- **CRITICAL:** You MUST stop and wait for the user's explicit "continue" before proceeding.

---

## Phase 2: Plan

**Spawn a sub-agent** to run the planning phase:

```
Agent(
  description: "Planning phase",
  prompt: "Read the instructions in [this skill's directory]/nodes/node-plan.md
    and execute them. Read RESEARCH_OUTPUT.md for context.
    Use @create-implementation-plan to create the plan.
    Write the step list to PLAN_STEPS.md (include affected files and dependencies per step).
    Report back: the plan summary and number of planned steps."
)
```

**After the sub-agent returns**, present the plan for user review.

**Gate:** Do NOT proceed until the user approves the plan.

---

## Phase 3: Investigation (Parallel)

After plan approval, spawn **one sub-agent per plan step** in parallel. Each investigates its assigned step in deep detail, with full knowledge of the entire plan.

**Spawn all investigation sub-agents at once:**

For each step N in `PLAN_STEPS.md`:
```
Agent(
  description: "Investigate step [N]",
  prompt: "Read the instructions in [this skill's directory]/nodes/node-investigation.md
    and execute them. You are assigned Step [N]: [behavior description].
    Read implementation-plan.md for the full plan context.
    Read PLAN_STEPS.md for the step list.
    Write findings to INVESTIGATION_STEP_[N].md in the project root.
    Report back: verdict (can proceed / needs fixes / needs rework) and any blocking issues."
)
```

**IMPORTANT:** Launch all investigation agents in a single message so they run in parallel.

**After all sub-agents return:**

1. Read all `INVESTIGATION_STEP_[N].md` files
2. Collect all findings: mismatches, conflicts, missing dependencies, already-implemented steps
3. **Fix the plan yourself** — update `PLAN_STEPS.md` and `implementation-plan.md` to address:
   - Remove steps for behaviors already implemented
   - Fix file paths, type names, or function references that were wrong
   - Reorder steps if dependency issues were found
   - Add missing steps if gaps were identified
   - Resolve conflicts between steps
4. **Present to the user:**
   - What problems were found (grouped by category: already implemented, mismatches, conflicts, missing deps, edge cases)
   - What fixes you applied to the plan
   - The updated plan
5. **Gate:** Wait for user approval of the updated plan before proceeding.

---

## Phase 4: Implementation Loop

This is the core loop — it alternates between TDD steps and quality gates.

### For Each Step

**4a. TDD Step (run inline in the main session)**

Do NOT spawn a sub-agent for TDD steps. The main session executes them directly:

1. Read `nodes/node-tdd-step.md` for the procedure (only needs to be read once at the start of the loop — keep it in context)
2. Read `PLAN_STEPS.md` to find the next pending step
3. Read the corresponding `INVESTIGATION_STEP_[N].md` for the curated context (affected files, existing patterns, gotchas) so you don't have to re-investigate
4. Execute the red-green-refactor cycle following `node-tdd-step.md`
5. Update `PLAN_STEPS.md` and `IMPLEMENTATION_PROGRESS.md` when done

After each step:
- If step succeeded → continue to the next pending step (or quality gate)
- If step had issues → ask user for guidance before continuing

**Why inline:** consecutive TDD steps usually touch the same module and reuse the same imports, types, and helpers. A fresh sub-agent per step would re-read those files every time. Running inline keeps that context warm.

**4b. Quality Gate Check**

Every **2-3 completed steps**, **spawn a sub-agent** for the quality gate:

```
Agent(
  description: "Quality gate after steps [X-Y]",
  prompt: "Read the instructions in [this skill's directory]/nodes/node-quality-gate.md
    and execute them. Review tests and code from the most recent 2-3 steps.
    Report back: quality score, issues found, issues fixed, pass/needs-fixes."
)
```

**After the sub-agent returns**, route based on quality result:
- If `quality: "pass"` → continue to next TDD step
- If `quality: "needs-fixes"` → spawn another sub-agent to fix, then re-check
- **Max 2 quality re-checks** per checkpoint to prevent infinite loops

### Loop Termination

Stop the implementation loop when:
- All planned behaviors are implemented (check against the plan)
- User explicitly says "stop" or "done"
- Step count exceeds 20 (safety limit)

---

## Phase 5: Validation (Parallel)

After all implementation steps are complete, spawn **one sub-agent per step** in parallel for independent validation.

**Spawn all validation sub-agents at once:**

For each completed step N:
```
Agent(
  description: "Validate step [N]",
  prompt: "Read the instructions in [this skill's directory]/nodes/node-validation.md
    and execute them. You are assigned Step [N]: [behavior description].
    Read implementation-plan.md for the full plan.
    Read PLAN_STEPS.md for all step statuses.
    Read IMPLEMENTATION_PROGRESS.md for implementation details across all steps.
    Write findings to VALIDATION_STEP_[N].md in the project root.
    Report back: verdict (valid / valid with caveats / invalid) and any issues found."
)
```

**IMPORTANT:** Launch all validation agents in a single message so they run in parallel.

**After all sub-agents return:**

1. Read all `VALIDATION_STEP_[N].md` files
2. Collect all issues found
3. If any step is invalid → spawn fix sub-agents, then re-validate
4. Present validation results to the user

---

## Phase 6: Summary

**Spawn a sub-agent** for the final summary:

```
Agent(
  description: "Final summary",
  prompt: "Read the instructions in [this skill's directory]/nodes/node-summary.md
    and execute them. Read RESEARCH_OUTPUT.md, PLAN_STEPS.md, and
    IMPLEMENTATION_PROGRESS.md. Run the full test suite and linting.
    Report back: complete summary with steps, quality gates, test results, files changed."
)
```

Present the final summary to the user.

---

## Error Handling

- If any sub-agent fails → report the error to the user and ask how to proceed
- If user wants to skip a phase → mark it skipped and proceed
- Keep `IMPLEMENTATION_PROGRESS.md` updated so work survives interruptions
- If a sub-agent's context is too large (very complex phase) → break it into multiple smaller sub-agents

## Related Skills

- `@create-implementation-plan` - Used in Phase 2 for plan creation
- `@tdd-design` - Core TDD methodology used in Phase 4
- `@test-quality-reviewer` - Used in quality gate checks
- `@code-refactoring` - Used in quality gate reviews
- `@context7` - Used for library documentation during research
- `@web-search` - Used for broader research during Phase 1
