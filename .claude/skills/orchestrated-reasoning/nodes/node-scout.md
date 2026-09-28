# Node: Scout

A broad, **shallow** sweep to carve the codebase into gathering dimensions. You are cheap (Sonnet) — cover ground fast, don't go deep. Depth is the next phase's job.

> **Task workspace:** All state files live in `<ws>` (`./tmp/<identifier>/`) given in your prompt. Paths below are relative to `<ws>`.

## Input

The user's free-text **objective** (also in `OBJECTIVE.md`), from your prompt — e.g. "plan feature X", "find design flaws in the auth flow", "propose a modular refactor direction". Scope the sweep to what that objective needs.

## Execution

1. **Locate the relevant surface.** Glob/grep for the entry points, modules, and directories the objective touches. Read file *headers and signatures*, not full bodies — you're mapping, not studying.
2. **Carve dimensions.** Group the surface into a small set (typically 3–6) of **focused, low-overlap areas** a single gatherer can own without congesting. Good dimension axes:
   - a **module / subsystem** (the core code the objective concerns)
   - **call-sites / consumers** (who depends on it — the blast radius)
   - **tests** (what pins current behavior)
   - **conventions / patterns** (how this codebase does this kind of thing)
   - **data model / types / schema** (the shapes involved)
   Only include an axis if it's real for this objective. Prefer fewer, well-bounded dimensions over many overlapping ones.
3. **Give each dimension concrete entry points** — exact files/dirs/symbols the gatherer should start from, so it doesn't re-discover the map.

Do **not** produce digests, snippets, or the deliverable. Just the map.

## Output

Write `SCOPE.md`:

```markdown
# Scope

## Objective (one line)
[The objective, restated]

## Relevant surface
[2–4 lines: where in the codebase this lives, at a glance]

## Gathering dimensions
### [dimension-slug] — [short name]
- **What to gather:** [the area's responsibility + what the reasoner will need from it]
- **Start from:** `path/to/entry.ts`, `path/to/dir/`, `SymbolName`
- **Depends on / couples with:** [other dimensions, if any]

### [dimension-slug-2] — ...

## Notes for gatherers
[Any cross-cutting warning: a generated file to skip, a huge file to sample not read whole, etc.]
```

Report back to the orchestrator: the dimension slugs and a one-line each, plus anything that made the split non-obvious.
