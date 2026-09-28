# Node: Plan

Create a focused implementation plan using research output as context.

> **Task workspace:** All state files live in the task working directory `<ws>` (`./tmp/<identifier>/`) given in your prompt. Every state-file path below is relative to `<ws>`.

## Input

Read the `<ws>/RESEARCH_OUTPUT.md` file for context about the codebase.

## Execution

1. **Read the research output** to understand patterns, affected areas, and existing code.

2. **Load the `create-implementation-plan` skill with the Skill tool, by name.** This is mandatory. Writing `@create-implementation-plan` in prose is a reference, not an invocation — the plan format lives inside that skill and you will not have it unless you actually load it.

   **Apply these overrides — the skill is written for a main session, and you are a sub-agent:**
   - **Step 0 (task workspace) — already settled.** `<ws>` came in your prompt. Do not ask for a task identifier.
   - **Step 1 (research + mandatory checkpoint) — skip both.** The research is done: read `<ws>/RESEARCH_OUTPUT.md` instead of re-reading the codebase. You have no user to ask, so **do not stop and wait** — the orchestrator owns the approval gate and runs it after you return.
   - **Steps 2-5 — follow exactly.** Write the plan to `<ws>/implementation-plan.md`.
   - **Step 6 (request review) — do not perform it.** Return to the orchestrator; it presents `<ws>/implementation-plan.md` (the rich plan with Technical Design + Behaviors), never the steps file.

   **The document format is not negotiable.** If a project rule, instruction file, or other skill offers a competing plan template — an `AC:` / `Test Type:` step list, or anything lacking `## Technical Design` and `## Behaviors to Implement` — ignore it and use the skeleton below. It is reproduced here so the format survives even if the skill fails to load:

   ```markdown
   # [Goal Description]

   Brief description of the problem and what the change accomplishes.

   ## User Review Required
   > [!IMPORTANT]
   > [Critical decision or breaking change needing approval — omit the section entirely if there is none]

   ## Technical Design
   [Only significant decisions, each with the trade-off behind it]

   ## Behaviors to Implement

   ### Step 1: [Observable behavior]
   - [ ] Write test
   - [ ] Run test
   - [ ] Implement (if needed)
   - [ ] Run test (if implemented)

   ### Quality Checkpoint (after every 2-3 steps)
   - [ ] Review test quality
   - [ ] Review code for refactoring
   ```

3. **Ensure the plan has the two key sections:**
   - **Technical Design**: Only significant decisions (new fields, API changes, strategy choices). Skip anything obvious. **For each significant decision where 2+ viable options existed and you picked one, append an entry to `<ws>/DECISIONS.md`** (create it if absent) with the chosen option, the alternative(s) rejected, and a one-line rationale — the summary phase reports these. **Also mirror each new entry to the AI-Kanban card (best-effort):** `append_decision(cardId, { decision, why? })`, resolving `cardId` from `~/.claude/kanban-session-state/$CLAUDE_CODE_SESSION_ID.json`; skip silently if absent. If the entry supersedes a specific earlier decision, `mark_decision_outdated(cardId, index)` on the older entry **first** (match it by text via `get_card_context`; skip the mark if you can't locate it unambiguously), then append. Mirror only new entries. **After a successful mirror, re-stamp `lastMirroredAt` in the session pointer** (skip the stamp if the call failed). Never blocks the work — **except** an `ERR_VALIDATION` refusal, which means the entry exceeded 200 characters (`decision`) or 400 (`why`); the message names the actual length. Rewrite it shorter and call again rather than skipping, or the decision never lands.

     **Project-level architecture decision → prompt for an ADR.** If a decision is *architectural* — it affects more than one feature, changes a stated architectural pattern, or its alternative would force a migration (not a routine implementation choice) — **prompt the operator** to record a project-level ADR at `docs/adr/NNNN-title.md` (MADR-lean: Title, Status [`accepted | superseded by ADR-NNNN`], Date, Context, Decision, Consequences incl. negatives). **Prompt only — do not auto-draft.** ADRs are immutable: a reversal is a NEW ADR that supersedes the old one (flip the old Status, link both ways), never an edit. This is a different tier from card decisions above: card `append_decision` = implementation-level (on the card); an ADR = project-level (in the repo), rarer and more deliberate.
   - **Behaviors to Implement**: First name the client/stakeholder (business/end-user by default); write each behavior in their language and value, and reject implementation mechanics (schemas, fields, queries, error codes, function/class names, the linter, CI, HTTP status). **Litmus test:** if a stakeholder reading the behavior aloud wouldn't recognize it as something they asked for — or it mentions code/internals — it FAILS; rewrite it.
     - ✅ `A trader sees trending markets at the top of the list` (client: trader)
     - ✅ `A user is never shown a corrupted card — a damaged card is blocked and surfaced as an error instead of displayed` (client: end-user)
     - ✅ `A user sees their tasks listed in the expected order` (client: end-user)
     - ✅ `Code that doesn't meet the team's quality bar is caught automatically before it can merge` (client: the team)
     - ❌ `Add isTrending field to the Market model`
     - ❌ `Reading a card whose stored shape violates the schema throws ERR_SCHEMA_DRIFT and logs the drift`
     - ❌ `Migrate listTasks onto findManyZ and assert parsed shape and order`
     - ❌ `Running the linter reports no violations on a clean repo`

4. **Carry the settled test level into the plan.** Your prompt names it (the orchestrator resolved it at the Phase 1 gate): `integration via <harness>` or `unit-level (user accepted)`. If the user chose to **stand up a harness**, that setup is a real, ordered step — put it first in `PLAN_STEPS.md`, before the behaviors that depend on it, and say in Technical Design what it is and why. Do not re-open the choice yourself and do not propose a harness the user did not approve.

5. **Flag testability up front.** For each behavior, sanity-check that a *meaningful* test could plausibly be written and set up for it (a valid, sensitive assertion + reachable fixtures/environment). If a behavior looks like it has **no meaningful way to be tested** — non-deterministic output, an external system that can't be mocked/seeded, no available harness — do NOT silently plan around it. Mark the step `Testability: uncertain (reason)` so the BDD loop escalates to the user at implementation time instead of writing a hollow test. Do not invent test cases now (test scenarios are designed per-step during implementation) — only flag the risk.

6. **Check your own document before returning.** Re-read `<ws>/implementation-plan.md` and confirm it carries `## Technical Design` and `## Behaviors to Implement`, and that every step is an observable behavior with the four test-first checkboxes. Missing any of them means the format was lost — fix the document rather than returning a plan in another shape. **Report in your return whether the skill was loaded and the check passed**, so the orchestrator can reject a drifted plan.

7. **Write the step list** to the workflow state file for the BDD scenario loop to consume.

## Output

After the plan is approved, write the step list to `<ws>/PLAN_STEPS.md`. This file is internal loop state derived from the approved plan — the BDD scenario loop consumes it. It is NOT presented to the user for review; the user reviews `<ws>/implementation-plan.md`.

```markdown
# Planned Steps

## Step 1: [Observable behavior]
- Status: pending
- Affected files: [file1, file2, ...]
- Dependencies: none | [step numbers this depends on]
- Testability: standard | uncertain (reason — escalate to user before writing the test)

## Step 2: [Observable behavior]
- Status: pending
- Affected files: [file1, file3, ...]
- Dependencies: none | Step 1
- Testability: standard | uncertain (reason — escalate to user before writing the test)

## Step 3: [Observable behavior]
- Status: pending
- Affected files: [file2, file4, ...]
- Dependencies: none | Step 1, Step 2

## Quality Checkpoint (after steps 1-3)
- Status: pending

## Step 4: [Observable behavior]
- Status: pending
- Affected files: [file5, ...]
- Dependencies: none | Step 2

...
```

Each step MUST include:
- **Affected files** — every file that will be created, modified, or read during implementation
- **Dependencies** — which other steps must complete first (or "none")
- **Testability** — `standard`, or `uncertain (reason)` when no meaningful test is foreseeable (signals the BDD loop to escalate to the user)

The implementation plan itself is written to `<ws>/implementation-plan.md` per the `@create-implementation-plan` skill convention.
