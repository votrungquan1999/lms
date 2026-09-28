# Node: Gather

Read one dimension **deeply** and condense it into a digest the planner can trust without re-reading the code. You are cheap (Sonnet); the expensive planner will build the entire plan on top of what you write here — so the digest's job is **fidelity, not brevity**.

> **Task workspace:** All state files live in `<ws>` (`./tmp/<identifier>/`) given in your prompt. Paths below are relative to `<ws>`.

## Input

Your prompt names your **dimension** (a slug from `SCOPE.md`) and its entry points. If you were spawned as a **consult follow-up**, your prompt instead names a specific `NEEDS` item (a concrete question + where to look) and the `DIGEST_FOLLOWUP_[id].md` file to write.

Read your dimension's section in `SCOPE.md` for the entry points and what to gather.

## The one rule: anchors, not summaries

A summary the planner cannot verify is worse than nothing — it plans against a fiction. **Every claim in your digest must be backed by a `path:line` anchor and, where behavior matters, a real code snippet.** "This module validates the token" is useless; `auth/verify.ts:88 — rejects when exp < now, but does NOT check the audience claim` is what the planner needs.

Bias toward including the actual code over describing it. When in doubt, paste the snippet.

## Execution

1. Read your dimension's files — deeply this time (bodies, not just signatures). Follow references within your dimension.
2. For each thing that matters to the change, capture: **where it is** (`path:line`), **what it does**, and **why it matters to the refactor** (constraint, coupling, risk).
3. Note the **conventions** in this area (how errors are handled, how this layer is tested, naming/structure patterns) — the plan must fit them.
4. Flag **coupling and gotchas**: implicit contracts, shared state, ordering dependencies, anything that will bite an implementer.
5. If a thread runs into another dimension or is too large to finish, list it under **Open threads** — don't chase it out of scope; the orchestrator can dispatch it.

## Output

Write `DIGEST_[dimension].md` (or the follow-up file named in your prompt):

```markdown
# Digest: [dimension name]

## Files examined: [count]

## Responsibility
[What this area is / does, 2–3 lines]

## Key symbols
- `path/to/file.ts:42` `functionName(args) -> Ret` — [what it does; why it matters to the change]
- `path/to/other.ts:120` `ClassName.method` — [...]

## Relevant snippets
​```ts
// path/to/file.ts:42-58
<the actual code, trimmed to what matters — keep it verbatim>
​```

## Conventions in this area
- [How errors/results are handled here] (`path:line`)
- [How this layer is tested] (`path:line`)

## Coupling & gotchas
- [Implicit contract / shared state / ordering dep] (`path:line`) — [why it will bite]

## Open threads
<!-- Code-answerable but out of your dimension or too large. Concrete question + where to look. Empty if none. -->
- [Question] — start from `path`/`Symbol`
```

Report back to the orchestrator: the digest filename, files-examined count, and whether **Open threads** is empty.
