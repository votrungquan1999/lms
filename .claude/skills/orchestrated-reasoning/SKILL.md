---
name: orchestrated-reasoning
description: Produce a deep-reasoning deliverable over a large codebase while conserving an expensive reasoning model. Cheap Sonnet scout/gatherer sub-agents read the code and condense it into structured digests; a Fable reasoner sub-agent reads the digests (pulling real files when a digest is thin) and produces the deliverable your objective asks for — a feature or refactor plan, a design-flaw critique, a modular-refactor direction, an architecture assessment, whatever you describe. The objective is free text. Stops at the reasoning deliverable — never implements. Use when reading the whole codebase with the premium model would be wasteful, or when the user says "orchestrated reasoning", "cheap gather then have the expensive model reason/plan/critique", "use Fable to plan/critique/analyze", "find design flaws", "find a modular refactor direction", or "tiered reasoning". Do NOT use for small tasks where one model can just read and reason directly.
allowed-tools: Read, Grep, Glob, Bash, Write, Agent, TodoWrite
---

# Orchestrated Reasoning

The main session is an **orchestrator**: it does no reading or reasoning itself — it spawns sub-agents and routes between them through state files in a per-task workspace. The point is **model-tier economics**: cheap models (Sonnet) do the token-heavy code reading and condense it to files; the expensive model (Fable) spends its tokens only on the hard reasoning your objective demands, never on bulk reading.

The **objective is free text** — "plan feature X", "propose a modular refactor direction for this service", "find design flaws in the auth flow", "assess whether this module should be split". The pipeline is the same regardless of objective; only the reasoner's deliverable changes shape to fit it.

Pipeline: scope → gather (fan-out) → reason ↔ consult-loop → deliver. **Reasoning deliverable only** — this skill never implements.

## Why this shape

The failure mode of "cheap model reads, premium model reasons" is a **lossy digest**: the scout writes vague prose, the reasoner reads it, misunderstands, and reasons against a wrong mental model. Two rules prevent it:

- **Digests carry anchors, not summaries** — every claim is backed by a `path:line` and a real snippet (see `nodes/node-gather.md`). A digest the reasoner can't verify is worthless.
- **The reasoner can pull the real file** — Fable gets Read/Grep, so when a digest is thin it reads the source directly instead of guessing. For anything needing *broad* re-exploration it emits a `NEEDS` request and a cheap scout handles it (the consult loop) — formalized so it can't be skipped.

## Orchestrator Rules

- **Delegate everything.** Never scout, gather, or reason in the main session — spawn the node sub-agent. Delegation is what keeps the orchestrator a lean router and keeps premium tokens off bulk reading.
- **Thread the objective.** Pass the user's free-text objective, verbatim, into every sub-agent prompt. The scout scopes to it, the gatherers gather what it needs, and the reasoner shapes its deliverable to it.
- **Fan out to the cap.** Spawn one gatherer per dimension, capped at **4 per message**, in a single message so they run in parallel. Group tightly-coupled areas into one gatherer; split unrelated areas apart.
- **Route on returns.** Read state files to decide and to relay findings to the user. Do not re-analyze a sub-agent's output in your own words.
- **Conserve Fable.** The reasoner is the only Fable call. Everything upstream (scope, gather, consult follow-ups) is Sonnet/Haiku. If you catch yourself about to spawn Fable for anything but the reasoning step, stop.
- **Log decisions.** When any phase faces **2+ viable options and picks one** (including user-resolved ones), append to `<ws>/DECISIONS.md`: chosen option, alternative(s), one-line why. Skip forced moves.

**Spawn pattern** — keep the prompt minimal; the node file carries the instructions:

```
Agent(
  description: "[phase] [assignment]",
  model: [see lever],
  prompt: "Read [skill dir]/nodes/node-X.md and execute it. Workspace <ws> (./tmp/<identifier>/).
    Objective: [the user's free-text objective, verbatim].
    [Assignment: which dimension / which digests / which NEEDS items.]
    Report back: [what the orchestrator needs to route]."
)
```

**Model lever** (per-call `model`: `"haiku"|"sonnet"|"opus"|"fable"`).
- Orchestrator (main session) → run on **Opus** — cheap-ish coordination and routing.
- Scout, gatherers, consult follow-ups → `"sonnet"` (Sonnet 5). Drop to `"haiku"` for a purely mechanical sweep.
- Reasoner → `"fable"` (Fable 5). This is the whole reason for the skill — nothing else gets Fable.

## Task Workspace & State Files

Every run is scoped to a **task identifier** (a ticket id, or a confirmed kebab-case slug). All state lives in `<ws>` = `./tmp/<identifier>/`, so parallel tasks never collide. Establish it in Phase 0 and pass its path into every sub-agent. `./tmp/` is gitignored; delete the folder when done.

- `OBJECTIVE.md` — the free-text objective, written verbatim (so every sub-agent shares one source of truth)
- `SCOPE.md` — the gathering dimensions (from the scout)
- `DIGEST_[dimension].md` — one structured digest per dimension (from gatherers)
- `DIGEST_FOLLOWUP_[id].md` — digests produced during the consult loop
- `NEEDS_[round].md` — the reasoner's requests for more context (transient, per round)
- `REASONING.md` — the deliverable the user reviews
- `DECISIONS.md` — running decision log

---

## Phase 0: Establish Workspace & Objective

Confirm the **objective** in one line with the user if it isn't already crisp (what deliverable do they want — a plan? a critique? a refactor direction?). Ask for a task identifier (or derive a kebab-case slug from the objective and confirm it). Create `./tmp/<identifier>/` and write the objective verbatim to `OBJECTIVE.md`. **Gate:** do not proceed until the workspace exists. **Before creating it, check whether `./tmp/<identifier>/` already holds artifacts from unrelated work — if so, STOP and ask the user** rather than overwriting another task's run.

## Phase 1: Scope

Spawn **one** `node-scout.md` sub-agent (`sonnet`). It does a broad, shallow sweep — steered by the objective — and proposes the **gathering dimensions** (a small set of focused areas, each with concrete entry points) into `SCOPE.md`.

Present the proposed dimensions to the user.

**Gate:** ask "gather these areas, or adjust the split?" and wait for approval. Fold any change into `SCOPE.md` yourself.

## Phase 2: Gather (fan-out)

Spawn one `node-gather.md` sub-agent (`sonnet`) per dimension from `SCOPE.md`, batched to the cap (≤4/message, in one message for parallelism). Each writes `DIGEST_[dimension].md` in the structured, anchor-rich format the node defines, focused on what the objective needs.

On return, do a **cheap completeness check** (not a re-analysis): does every dimension have a digest, and does each digest actually carry `path:line` anchors and snippets rather than vague prose? If a digest is empty or summary-only, re-spawn that one gatherer with a sharper assignment. Do **not** proceed to Fable with thin digests — that is the exact failure this skill exists to prevent.

## Phase 3: Reason (with consult loop)

Spawn `node-reason.md` (**`fable`**), passing the objective. It reads every `DIGEST_*.md`, and has Read/Grep/Glob so it can pull the real source when a digest is thin. It returns one of two things:

- **`REASONING.md` written** → done. Present it to the user.
- **`NEEDS_[round].md` written** (it needs broad context a cheap scout should fetch) → service it: spawn one `node-gather.md` follow-up (`sonnet`) per NEEDS item, each writing `DIGEST_FOLLOWUP_[id].md`, then **re-spawn the same `node-reason.md`** pointing it at the new follow-up digests plus the originals.

Cap the consult loop at **2 rounds**. If the reasoner still emits `NEEDS` after round 2, have it write the best `REASONING.md` it can with the gaps flagged as **Open Questions**, and present that.

**Deliver:** present `REASONING.md`. This skill stops here — acting on the deliverable is the user's call.

## Error Handling

- Sub-agent fails → report and ask how to proceed.
- User skips the scope gate → proceed with your best-guess dimensions, note it.
- A digest comes back thin → re-spawn that gatherer once; if still thin, tell the user before spending Fable.
- Workspace context too large for one gatherer → split the dimension into more gatherers.

## Related Skills

`@create-implementation-plan` (when the objective is a plan, for output-format reference) · `@find-patterns` (convention extraction) · `@root-cause-analysis` (when the objective is a bug/flaw hunt) · `@context7` + `@web-search` (external docs during scope/gather).
