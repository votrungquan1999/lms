---
name: orchestrated-feature-dev
description: Orchestrated multi-phase feature development — sub-agent phases (research, plan, investigation, implementation-blind behavior-risk catalog, batched BDD, conformance + adversarial verification) with quality-gate and human-approval loops. Use for large or high-stakes features where the full rigor is wanted: explicit planning, test-first BDD, and adversarial verification of the un-specified space. Trigger on "orchestrated development", "structured/deep feature build", "full development pipeline", or when asked to build a complex feature end-to-end with tests and review gates. Do NOT use for quick edits or single-step changes — the gated pipeline is overkill there.
---

# Orchestrated Feature Development

The main session is an **orchestrator**: it spawns a sub-agent for every working phase (it does none of the work itself), passes data between phases through state files in a per-task workspace, and routes based on what each sub-agent returns. Each node file under `nodes/` holds the *how* for one phase; this file holds only *what to spawn, what to pass, and how to route*.

Pipeline: research → plan → (investigation ∥ behavior-risk catalog) → BDD-batch ↔ quality-gate → (conformance ∥ adversarial verification) → mutation pass → summary.

## Orchestrator Rules

- **Delegate everything.** Never research, plan, investigate, catalog, implement, or verify in the main session — spawn the node sub-agent. Delegation (not model choice) is what keeps the orchestrator a lean router.
- **Batch to the cap.** For investigation, BDD, and verification, put **as many related steps as possible into one sub-agent, capped at 4** (group by shared files/module) — one agent amortizes the shared-context read across its steps, but beyond ~4 its context congests and quality drops. Spawn a phase's batches in a single message so they run in parallel.
- **Route on returns.** Read state files to make decisions and relay sub-agent outputs to the user. Do not re-analyze findings in your own words.
- **Freeze `BEHAVIOR_RISKS.md`** once Phase 3b writes it — the adversarial phase checks against it; never edit it to match what was built.
- **Serialize git.** Under the `per-behavior` commit strategy, never spawn BDD batches in parallel — concurrent sub-agents committing to one branch corrupt each other's history, and batches are grouped by *shared files*, so one file's diff cannot be split across behaviors after the fact. Run batches one at a time. Verification (Phase 5) stays parallel because those sub-agents only report; the single fix sub-agent does the git work.
- **Mutation testing happens in Phase 5c or not at all.** No phase mutates source to check a test — not the BDD loop, not the quality gate, not conformance. Judging sensitivity by reading is every other phase's job; the one pass that injects real defects is budgeted, runs alone, and uses `nodes/mutation-harness.py`. Never write mutation instructions into a sub-agent prompt yourself.
- **Log decisions.** Whenever any phase or the orchestrator faces **2+ viable options and picks one** (including choices the user resolved), append to `<ws>/DECISIONS.md`: chosen option, alternative(s), one-line why. Skip forced moves.
- **Mirror decisions to the card (best-effort).** The `DECISIONS.md` write *is* the trigger: every time you add a NEW entry, also mirror *that entry* to the AI-Kanban card so the "why" outlives `<ws>` — `append_decision(cardId, { decision, why? })`. Resolve `cardId` from the session pointer `~/.claude/kanban-session-state/$CLAUDE_CODE_SESSION_ID.json` (`cardId` field); if the file/field is absent (no card tracked this session), **skip the mirror silently**. If the new entry **supersedes** a specific earlier decision, call `mark_decision_outdated(cardId, index)` on the older entry **first**, then `append_decision` for the replacement — so a mid-way failure never leaves two contradictory *active* entries. Resolve `index` by re-reading `get_card_context(cardId)` and matching the older entry's **text** (not a remembered position); skip the mark if you can't locate it unambiguously. Mirror only newly-added entries, never re-send the whole file. **After a successful mirror, re-stamp `lastMirroredAt` in the session pointer** — that is what clears the `flush-debt` nudge; skip the stamp if the call failed, so the debt stays visible. Every call is non-blocking — on failure, note it and keep working. **One exception:** `decision` is capped at 200 characters and `why` at 400, and an over-long entry is refused with `ERR_VALIDATION` naming the actual length. That is not a failure to keep working past — rewrite it shorter and call again, or the entry never reaches the card.

**Spawn pattern** — keep the prompt minimal; the node carries the instructions:

```
Agent(
  description: "[phase] [assignment]",
  model: [see lever],
  prompt: "Read [skill dir]/nodes/node-X.md and execute it. Workspace <ws> (./tmp/<identifier>/).
    [Assignment: which steps/risks, which state files to focus on.]
    Report back: [what the orchestrator needs to route]."
)
```

**Model lever** (per-call `model`: `"haiku"|"sonnet"|"opus"`; `"sonnet"` = current Sonnet 5). `CLAUDE_CODE_SUBAGENT_MODEL` overrides all.
- Orchestrator, research, plan, quality-gate, **behavior-risk catalog** → default (Opus) — full/adversarial judgment.
- Investigation, BDD, both verification passes, **mutation pass** → `"sonnet"` (Sonnet 5 is strong enough; keeps the main session lean).
- Summary → `"haiku"`.

## Task Workspace & State Files

Every run is scoped to a **task identifier** (a ticket id, or a confirmed kebab-case slug). All state lives in `<ws>` = `./tmp/<identifier>/`, so parallel tasks never collide. Establish it in Phase 0 and pass its path into every sub-agent. `./tmp/` is gitignored; delete the folder when done.

- `RESEARCH_OUTPUT.md` — research findings (+ `RESEARCH_FOLLOWUP_[id].md`, folded back in)
- `implementation-plan.md` — the plan the user reviews (Technical Design + Behaviors)
- `PLAN_STEPS.md` — step list with files/deps; workflow state, **not** for user review
- `INVESTIGATION_STEP_[N].md` — per-step investigation context
- `BEHAVIOR_RISKS.md` — implementation-blind behavior-risk catalog (Phase 3b); **frozen** after
- `IMPLEMENTATION_PROGRESS.md` — per-step results + red/green audit trail
- `VALIDATION_STEP_[N].md` — conformance results (5a); `ADVERSARIAL_REVALIDATION.md` — adversarial findings (5b)
- `MUTATION_PLAN.md` — whether Phase 5c runs, and its budget; `MUTANTS.json` + `MUTATION_RESULTS.md/.json` — the pass's inputs and findings
- `DECISIONS.md` — running decision log (each new entry is also mirrored to the AI-Kanban card — see **Mirror decisions to the card**)
- `COMMIT_PLAN.md` — the commit strategy, base SHA, and behavior→commit-subject map (see `nodes/commit-protocol.md`)

---

## Phase 0: Establish Workspace

Ask for a task identifier (or derive a kebab-case slug from the request and confirm it). Create `./tmp/<identifier>/`. **Gate:** do not proceed until it exists. **Before creating it, check whether `./tmp/<identifier>/` already holds artifacts from unrelated work — if so, STOP and ask the user** rather than overwriting another task's run.

The identifier doubles as the `<slug>` for the feature's living spec (`docs/features/<slug>/spec.md`, written at Phase 6). If a spec already exists for this `<slug>`, skim it first as recall context — this run **updates** that same living spec rather than starting fresh.

**Drop the spec-reminder sentinel (best-effort).** Write `{ slug, specPath: "docs/features/<slug>/spec.md" }` to `~/.claude/spec-reminder-state/$CLAUDE_CODE_SESSION_ID.json`. This is what the `spec-reminder` Stop hook reads to nudge you, at session end, to update the living spec before wrapping up. Skip silently if `$CLAUDE_CODE_SESSION_ID` is unset.

## Phase 1: Research (convergence loop)

Spawn `node-research.md` as the INITIAL agent → writes `RESEARCH_OUTPUT.md`. While its "Follow-up Investigations Needed" is non-empty, spawn one follow-up agent per item (parallel), fold each `RESEARCH_FOLLOWUP_[id].md` back into `RESEARCH_OUTPUT.md`, and rebuild the list from new threads. Stop when empty or after **3 rounds**. Then present findings + only the genuine Open Questions.

**Settle the test level here.** Read the `Testing Patterns` block of `RESEARCH_OUTPUT.md`. The BDD loop defaults to the **integration level** — real flow, real collaborators, asserted at the client-facing entry point — because a mocked unit test stays green while the wiring, transaction, serialization, or permission check is broken.

- **A harness exists** → note `Test level: integration via <harness>` in `DECISIONS.md`, and pass the harness, its command, and the example file to mirror into every BDD sub-agent prompt. No question needed.
- **`none found`** → **ask the user now, in the same message as the gate.** This is the cheapest moment: the plan isn't written, so a harness-setup step can still be planned in rather than retrofitted after ten mocked tests. Offer: **stand one up** (name the concrete setup and its cost — it becomes a step in the plan), **point you at one you missed**, or **accept unit-level for this feature** (wiring goes unverified). Never let a run fall back to mocked unit tests without that answer, and never invent containers or a browser runner unasked.

Record the resolution in `DECISIONS.md`, mirror it to the card, and pass it to `node-plan.md`.

**Gate:** ask "continue to planning, or investigate more?" — plus the test-level question when the verdict was `none found` — and wait for explicit continue.

## Phase 2: Plan

Spawn `node-plan.md` (reads `RESEARCH_OUTPUT.md`, loads the `create-implementation-plan` skill) → writes `implementation-plan.md` + `PLAN_STEPS.md`.

**Check the format before presenting.** `implementation-plan.md` must carry `## Technical Design` and `## Behaviors to Implement` with test-first checkboxes per step. A plan shaped as an `AC:` / `Test Type:` step list means the sub-agent never loaded the skill — send it back to a fresh sub-agent rather than presenting it. Then present `implementation-plan.md` (never `PLAN_STEPS.md`) for review.

**Gate:** do not proceed until the user approves the plan.

## Phase 3: Investigation (batched parallel)

Spawn `node-investigation.md`, one sub-agent per batch (batch to the cap), each assigned its steps → writes `INVESTIGATION_STEP_[N].md` per step. On return, **fix the plan yourself** (`PLAN_STEPS.md` + `implementation-plan.md`): drop already-done steps, fix wrong paths/types, reorder for deps, add gaps, resolve conflicts. Present problems (grouped) + fixes + updated plan.

**Gate:** wait for approval of the updated plan.

## Phase 3b: Behavior-Risk Catalog (implementation-blind, parallel with Phase 3)

Spawn `node-behavior-risk.md` (may go in the same message as the investigation batches). It catalogs edge-case **behaviors** from the requirement + existing system only — **never** the new implementation — into `BEHAVIOR_RISKS.md`. On return:

1. **Escalate requirement-silent entries now** — each is a 2+ defensible-behaviors product decision, cheaper to resolve before implementation. Fold each resolution into `implementation-plan.md` (+ a `PLAN_STEPS.md` step if it adds behavior); log to `DECISIONS.md` (and mirror it to the card).
2. **Freeze the catalog** — requirement-implied entries become the Phase 5b checks; `BEHAVIOR_RISKS.md` is now immutable.

**Gate:** if there were silent entries, wait for the user's decisions.

## Phase 4: Implementation Loop

**4·0. Run-options gate — ask both questions before any code is written.** The behavior list is final now (Phase 3b may have added steps), so this is the last moment the answers are stable. Ask the operator both, in one message:

**a. How to commit?**
- **One commit per behavior** — each behavior is committed as soon as it goes green, and every later fix (quality gate, conformance, adversarial) is folded back into the commit that owns that behavior. The branch ends with exactly one commit per behavior in the plan. Say plainly that folding **rewrites history**, so it is only free while the branch is unpushed.
- **Defer all commits** — the run never touches git; everything accumulates in the working tree and the operator commits at the end.

**b. Run a mutation pass?** One budgeted Phase 5c pass that injects defects to prove the tests would catch them. Quote the real trade: on a past run it surfaced **8 false-green tests** the other phases missed, and the budgeted version costs roughly **10-20 minutes**. Default **on** for correctness-critical work (money, data integrity, scoring); **off** for UI/wiring work where a false green is cheap.

Write the commit answer to `<ws>/COMMIT_PLAN.md` per `nodes/commit-protocol.md` and the mutation answer to `<ws>/MUTATION_PLAN.md` (`Mutation: on|off`, plus the budget if it differs from the default ≤3 per behavior / ≤30 per run). Log both to `DECISIONS.md` and mirror them to the card. **Gate:** do not spawn the first BDD batch until the operator has answered both. Pass the commit strategy into every sub-agent you spawn from here on.

Batched BDD sub-agents alternate with quality gates.

**4a. BDD batch** — spawn `node-bdd-step.md` per batch (batch to the cap; same grouping as investigation). It runs its steps one-test-at-a-time with meaningful-red discipline and **bubbles up** on any gate. Route on its return:
- **Done, no gate** → quality gate (4b), then next batch.
- **Stopped at a gate** (untestable behavior / 2+ defensible behaviors / unresolved failure) → escalate to the user, log to `DECISIONS.md` (and mirror it to the card), then spawn a **new** sub-agent to resume that batch with the decision baked in.

Verify discipline via the red/green trail in `IMPLEMENTATION_PROGRESS.md`, not the prose summary.

**4b. Quality gate** — every **2-3 completed steps**, spawn `node-quality-gate.md`. `pass` → next batch; `needs-fixes` → spawn a fix sub-agent, re-check (**max 2** re-checks per checkpoint).

**Terminate** when all planned behaviors are done, the user says stop, or step count exceeds 20.

## Phase 5: Verification (batched parallel)

Two independent axes, spawned together so all run in parallel:

**5a. Conformance Validation** — "did each step match the plan?" Spawn `node-validation.md` per step-batch (to the cap) → `VALIDATION_STEP_[N].md`.

**5b. Adversarial Revalidation** — "does the code survive the frozen catalog?" Spawn `node-adversarial-revalidation.md` per risk-group (related risks together) → `ADVERSARIAL_REVALIDATION.md`.

Both verification passes **report only — they never stage, commit, or rebase** (they run in parallel; git must stay serialized).

**5c. Mutation pass (only if `MUTATION_PLAN.md` says `on`)** — "would the tests catch a defect at all?" Spawn `node-mutation.md` as a **single sub-agent, alone, after 5a and 5b have both returned** — it writes to the source tree, so it cannot overlap with passes that read and test it. It reports survivors; it never fixes. Triage each false green with the operator like a 5b finding.

On return:
- **Conformance (5a):** invalid steps → one fix sub-agent for all of them, then re-validate only those. Under `per-behavior`, that fix sub-agent **folds each fix into the commit owning that behavior** per `nodes/commit-protocol.md` — never a new commit.
- **Adversarial (5b): report + triage.** Present each break/silent-misbehavior with severity; the user decides **new step** (→ Phase 4) or **accepted/out-of-scope**. No auto-loop; log each to `DECISIONS.md` (and mirror each to the card). A fix to an existing behavior folds into that behavior's commit; a genuinely new behavior becomes a new step and earns its own commit — either way the one-commit-per-behavior count holds.

Present combined results.

## Phase 6: Summary

Spawn `node-summary.md` (reads the state files, aggregates the test/lint status already recorded — no full-project re-run) → complete summary with steps, quality gates, conformance + adversarial results, tests, files changed, key decisions. Present it.

## Error Handling

- Sub-agent fails → report and ask how to proceed.
- User skips a phase → mark skipped, proceed.
- Keep `IMPLEMENTATION_PROGRESS.md` current so work survives interruptions.
- Phase context too large → split into more sub-agents.

## Related Skills

`@create-implementation-plan` (Phase 2) · `@bdd-design` (Phase 4) · `@test-quality-reviewer` + `@code-refactoring` (quality gate) · `@context7` + `@web-search` (research).
