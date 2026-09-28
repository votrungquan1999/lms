---
name: recall
description: Answers "why did we do X", "what did we do about X", "recall the decision on X", or "back-track why we ..." by reading the AI-Kanban card's recorded decisions/progress, the knowledge base, and the repo's living spec and ADRs, then presenting what was done and why, newest first. Trigger on these phrasings or any request to recall past work or reasoning.
allowed-tools: mcp__ai-kanban-dispatch__list_cards, mcp__ai-kanban-dispatch__get_card_context, Read, Grep, Glob, Bash
---

# Recall: What Did We Do, and Why

You are answering a question about **past work** — a topic, feature, or decision the operator wants recalled without re-reading code or chat history. The answer lives in two places at different granularities: **implementation decisions** on the AI-Kanban card (fine-grained, per-build) and **project-level docs in the repo** (spec = what a feature does, ADRs = coarse-grained architectural why). Neither is a substitute for the other — synthesize both.

## When to use

Trigger on "why did we do X", "what did we do about X", "recall the decision on X", "back-track why we...", or any similarly-phrased ask about past reasoning or work. Extract the **topic** (a feature name, a component, a decision area) from the phrasing — that's what you search for in both places.

## Flow

### 1. Find candidate cards

Call `list_cards` with `text: <topic>` (and `tags` if the topic maps to known project tags) to find candidate cards. `list_cards` returns a **lean summary only** — no `decisions[]`, no `progress[]` — so it is for *finding* cards, never for *reading* them.

### 2. Read each candidate

For each candidate card, call `get_card_context(<id>)` — this is the only way `decisions[]` and `progress[]` are returned. **Never answer from `list_cards` alone**; if you skip this step, you have no decisions to report.

### 3. Grep the repo

In the repo currently being worked on (not this skills repo):
- `docs/features/*/spec.md` — what the feature does, its behaviors/ACs.
- `docs/adr/*` — project-level architecture decisions ("why MongoDB", "why event-sourced").

Grep/glob for the topic by filename and content. This is literal substring search — no RAG/embeddings in v1, so a differently-worded match can be missed; that's an accepted v1 limitation, not a bug.

### 4. Search the knowledge base

`npx @quanvo99/ai-rules@latest kb search "<topic>"`, then `kb get <id>` on anything that looks relevant. This is where **findings and reusable patterns** are promoted, as opposed to the card, which holds decisions. Skipping it means answering "what did we learn about X" from half the corpus.

`Bash` is in `allowed-tools` **only** for these read-only `kb search` / `kb get` calls. Don't use it for anything else in this flow.

Two limits to state in your answer rather than paper over:

- **Every capture is a draft until a human approves it**, and drafts do **not** surface in `kb search`. So a finding promoted last month may be genuinely unreachable, not absent. If the topic looks like it should have kb material and nothing comes back, say that a draft may be pending review.
- **kb entries carry no card provenance.** `kb capture` takes `--scope`/`--global` only — there is no `--card` flag — so a kb hit cannot be traced back to the card that produced it, and vice versa. Present the two sources side by side; never assert that a given kb entry came from a given card.

### 5. Synthesize and present

Combine all sources into one answer, newest first throughout:

- **What we did** — from `progress[]` entries and the spec's behaviors/ACs.
- **Why** — two tiers, kept distinct:
  - *Implementation-level*: the card's `decisions[]`. Show **active entries first**, then outdated entries as history (each labeled outdated, with what it was superseded by when known). A `supersededByIndex` may point at an entry that's itself outdated, or at an index that no longer resolves cleanly — walk the chain as far as it goes and show it as best-effort history; don't fail or block on a broken or chained pointer.
  - *Project-level*: matching ADRs, with their status (`accepted` / `superseded by ADR-NNNN`).
- **What we learned** — matching kb entries, labeled as knowledge-base hits so they are not mistaken for card decisions.
- If nothing is found on any side, say so plainly — name the topic you searched for and **every** place you looked, including the kb. Don't guess or fabricate an answer.

## Critical Rules

**DO:**
- Always read decisions/progress via `get_card_context`, never assume `list_cards` carries them.
- Keep the four sources labeled and distinct: card decisions (implementation why) vs. spec (what) vs. ADRs (project-level why) vs. kb (what we learned).
- Say when a kb miss might be a pending draft rather than an absence — drafts don't surface in `kb search`.
- Order everything newest first — recent reasoning first, older superseded reasoning as trailing history.
- Tolerate broken or chained `supersededByIndex` pointers — show what you can, don't error out.

**DO NOT:**
- Don't treat a `list_cards` result as if it contained decisions or progress.
- Don't invent a RAG/semantic layer — grep, MCP reads, and `kb search` only, v1.
- Don't fabricate an answer when the topic isn't found; report the gap.
- Don't claim a kb entry came from a particular card — no such link is recorded.
- Don't use `Bash` for anything beyond `kb search` / `kb get`.
