---
name: orchestrated-feature-dev
description: N8N-style orchestrated feature development with specialized node skills, conditional routing, and quality gate loops. Use when asked for "orchestrated development", "structured feature build", or "deep feature workflow".
---

# Orchestrated Feature Development

An n8n-style workflow that orchestrates specialized node skills through a structured pipeline with conditional routing and reflection loops.

## How This Works

This skill acts as an **orchestrator** — it sequences specialized node skills, passes data between them via artifact files, and makes routing decisions based on results. Each node reads from and writes to the Antigravity artifact directory (`<appDataDir>/brain/<conversation-id>/`).

```
[research] → [plan] → [tdd-step] ↔ [quality-gate] → [summary]
                           ↑              |
                           └── loop back ──┘
```

## Artifact Convention

All workflow state files are created as Antigravity artifacts in the brain directory for the current conversation. Use `write_to_file` with `IsArtifact: true` to create/update these files. The artifact directory path is provided to you at the start of each conversation.

**Workflow artifacts:**
- `research-output.md` — Research findings
- `plan-steps.md` — Step list for the TDD loop
- `loop-state.json` — Loop counter and metadata
- `step-result.md` — Latest TDD step result
- `quality-result.md` — Latest quality gate result

---

## Phase 1: Research Node

Read the node instructions from `nodes/node-research.md` in this skill's directory, then execute them.

**After completion**, read the `research-output.md` artifact and report:
- Number of files read
- Key patterns found
- Affected areas identified

**Gate:** Ask the user: "Research complete. Read more files, ask questions, or continue?"
- If "more files" → re-run this phase with expanded scope
- If "continue" → proceed to Phase 2

---

## Phase 2: Plan Node

Read the node instructions from `nodes/node-plan.md` in this skill's directory, then execute them.

The plan node will use `@create-implementation-plan` to create the plan, reading research output as additional context.

**Gate:** The plan node will request user review. Do NOT proceed until the user approves.

---

## Phase 3: Implementation Loop

This is the core loop — it alternates between TDD steps and quality gates.

### Initialize
Set iteration counter: write `{"current_step": 1, "quality_checks": 0, "max_steps": 20}` to the `loop-state.json` artifact.

### For Each Step

**3a. TDD Step Node**

Read the node instructions from `nodes/node-tdd-step.md` in this skill's directory, then execute them.

The node will:
1. Determine the next observable behavior to implement
2. Write a test for it
3. Run the test (MUST see result before implementing)
4. Implement if test failed; skip if test already passes
5. Write the step result to the `step-result.md` artifact

**After completion**, read `step-result.md` and decide:
- If step succeeded → increment `current_step` in `loop-state.json`
- If step had issues → ask user for guidance before continuing

**3b. Quality Gate Check**

Read `loop-state.json`. Every **2-3 completed steps**, trigger the quality gate:

Read the node instructions from `nodes/node-quality-gate.md` in this skill's directory, then execute them.

The quality gate will:
1. Run `@test-quality-reviewer` on recent tests
2. Run `@code-refactoring` review on recent implementation
3. Write findings to the `quality-result.md` artifact

**After completion**, read `quality-result.md` and route:
- If `quality: "pass"` → continue to next TDD step
- If `quality: "needs-fixes"` → fix issues, then re-run quality gate
- **Max 2 quality re-checks** per checkpoint to prevent infinite loops

### Loop Termination

Stop the implementation loop when:
- All planned behaviors are implemented (check against the plan)
- User explicitly says "stop" or "done"
- `current_step` exceeds `max_steps` (safety limit)

---

## Phase 4: Summary Node

Read the node instructions from `nodes/node-summary.md` in this skill's directory, then execute them.

Present the final summary to the user with:
- All steps completed
- Test results
- Quality gate outcomes
- Files changed

---

## Error Handling

- If any node fails unexpectedly → write error to an `error.md` artifact, stop, and report to user
- If user wants to skip a phase → mark it skipped in loop-state and proceed
- If context feels bloated → summarize what's done so far, use `task_boundary` to mark a new phase
