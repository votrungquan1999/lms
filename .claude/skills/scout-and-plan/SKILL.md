---
name: scout-and-plan
description: Plan a refactor or change in a large codebase while conserving an expensive planning model. Cheap Sonnet scout/gatherer sub-agents read the code and condense it into structured digests; a Fable planner sub-agent reads the digests (pulling real files when a digest is thin) and produces the plan. Stops at the plan — no implementation. Use for planning a large refactor, migration, or feature where reading the whole codebase with the premium model would be wasteful, or when the user says "scout and plan", "cheap gather then plan", "use Fable to plan", or "tiered planning". Do NOT use for small changes where one model can just read and plan directly.
allowed-tools: Read, Grep, Glob, Bash, Write, Agent, TodoWrite
---

# Scout and Plan

The main session is an **orchestrator**: it does no reading or planning itself — it spawns sub-agents and routes between them through state files in a per-task workspace. The point is **model-tier economics**: cheap models (Sonnet) do the token-heavy code reading and condense it to files; the expensive model (Fable) spends its tokens only on synthesis and planning, never on bulk reading.

Pipeline: scope → gather (fan-out) → plan ↔ consult-loop → deliver plan. **Plan only** — this skill never implements.

## Why this shape

The failure mode of "cheap model reads, premium model plans" is a **lossy digest**: the scout writes vague prose, the planner reads it, misunderstands, and plans against a wrong mental model. Two rules prevent it:

- **Digests carry anchors, not summaries** — every claim is backed by a `path:line` and a real snippet (see `nodes/node-gather.md`). A digest the planner can't verify is worthless.
- **The planner can pull the real file** — Fable gets Read/Grep, so when a digest is thin it reads the source directly instead of guessing. For anything needing *broad* re-exploration it emits a `NEEDS` request and a cheap scout handles it (the consult loop). This is "tell Sonnet to have Fable consult more," formalized so it can't be skipped.

## Orchestrator Rules

- **Delegate everything.** Never scout, gather, or plan in the main session — spawn the node sub-agent. Delegation is what keeps the orchestrator a lean router and keeps premium tokens off bulk reading.
- **Fan out to the cap.** Spawn one gatherer per dimension, capped at **4 per message**, in a single message so they run in parallel. Group tightly-coupled areas into one gatherer; split unrelated areas apart.
- **Route on returns.** Read state files to decide and to relay findings to the user. Do not re-analyze a sub-agent's output in your own words.
- **Conserve Fable.** The planner is the only Fable call. Everything upstream (scope, gather, consult follow-ups) is Sonnet/Haiku. If you catch yourself about to spawn Fable for anything but the plan step, stop.
- **Log decisions.** When any phase faces **2+ viable options and picks one** (including user-resolved ones), append to `<ws>/DECISIONS.md`: chosen option, alternative(s), one-line why. Skip forced moves.

**Spawn pattern** — keep the prompt minimal; the node file carries the instructions:

```
Agent(
  description: "[phase] [assignment]",
  model: [see lever],
  prompt: "Read [skill dir]/nodes/node-X.md and execute it. Workspace <ws> (./tmp/<identifier>/).
    [Assignment: which dimension / which digests / which NEEDS items.]
    Report back: [what the orchestrator needs to route]."
)
```

**Model lever** (per-call `model`: `"haiku"|"sonnet"|"opus"|"fable"`).
- Orchestrator (main session) → run on **Opus** — cheap-ish coordination and routing.
- Scout, gatherers, consult follow-ups → `"sonnet"` (Sonnet 5). Drop to `"haiku"` for a purely mechanical sweep.
- Planner → `"fable"` (Fable 5). This is the whole reason for the skill — nothing else gets Fable.

## Task Workspace & State Files

Every run is scoped to a **task identifier** (a ticket id, or a confirmed kebab-case slug). All state lives in `<ws>` = `./tmp/<identifier>/`, so parallel tasks never collide. Establish it in Phase 0 and pass its path into every sub-agent. `./tmp/` is gitignored; delete the folder when done.

- `SCOPE.md` — the gathering dimensions (from the scout)
- `DIGEST_[dimension].md` — one structured digest per dimension (from gatherers)
- `DIGEST_FOLLOWUP_[id].md` — digests produced during the consult loop
- `NEEDS_[round].md` — the planner's requests for more context (transient, per round)
- `PLAN.md` — the deliverable the user reviews
- `DECISIONS.md` — running decision log

---

## Phase 0: Establish Workspace

Ask for a task identifier (or derive a kebab-case slug from the request and confirm it). Create `./tmp/<identifier>/`. **Gate:** do not proceed until it exists. **Before creating it, check whether `./tmp/<identifier>/` already holds artifacts from unrelated work — if so, STOP and ask the user** rather than overwriting another task's run.

## Phase 1: Scope

Spawn **one** `node-scout.md` sub-agent (`sonnet`). It does a broad, shallow sweep and proposes the **gathering dimensions** — a small set of focused areas (module / call-sites / tests / conventions / data model), each with concrete entry points — into `SCOPE.md`.

Present the proposed dimensions to the user.

**Gate:** ask "gather these areas, or adjust the split?" and wait for approval. Fold any change into `SCOPE.md` yourself.

## Phase 2: Gather (fan-out)

Spawn one `node-gather.md` sub-agent (`sonnet`) per dimension from `SCOPE.md`, batched to the cap (≤4/message, in one message for parallelism). Each writes `DIGEST_[dimension].md` in the structured, anchor-rich format the node defines.

On return, do a **cheap completeness check** (not a re-analysis): does every dimension have a digest, and does each digest actually carry `path:line` anchors and snippets rather than vague prose? If a digest is empty or summary-only, re-spawn that one gatherer with a sharper assignment. Do **not** proceed to Fable with thin digests — that is the exact failure this skill exists to prevent.

## Phase 3: Plan (with consult loop)

Spawn `node-plan.md` (**`fable`**). It reads every `DIGEST_*.md`, and has Read/Grep/Glob so it can pull the real source when a digest is thin. It returns one of two things:

- **`PLAN.md` written** → done. Present `PLAN.md` to the user.
- **`NEEDS_[round].md` written** (it needs broad context a cheap scout should fetch) → service it: spawn one `node-gather.md` follow-up (`sonnet`) per NEEDS item, each writing `DIGEST_FOLLOWUP_[id].md`, then **re-spawn the same `node-plan.md`** pointing it at the new follow-up digests plus the originals.

Cap the consult loop at **2 rounds**. If the planner still emits `NEEDS` after round 2, have it write the best `PLAN.md` it can with the gaps flagged as **Open Questions**, and present that.

**Deliver:** present `PLAN.md`. This skill stops here — implementation is the user's call.

## Error Handling

- Sub-agent fails → report and ask how to proceed.
- User skips the scope gate → proceed with your best-guess dimensions, note it.
- A digest comes back thin → re-spawn that gatherer once; if still thin, tell the user before spending Fable.
- Workspace context too large for one gatherer → split the dimension into more gatherers.

## Related Skills

`@create-implementation-plan` (plan format reference) · `@find-patterns` (convention extraction) · `@context7` + `@web-search` (external docs during scope/gather).
