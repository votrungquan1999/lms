# Node: Scout

A broad, **shallow** sweep to carve the codebase into gathering dimensions. You are cheap (Sonnet) — cover ground fast, don't go deep. Depth is the next phase's job.

> **Task workspace:** All state files live in `<ws>` (`./tmp/<identifier>/`) given in your prompt. Paths below are relative to `<ws>`.

## Input

The user's refactor/change request from the conversation context.

## Execution

1. **Locate the affected surface.** Glob/grep for the entry points, modules, and directories the request touches. Read file *headers and signatures*, not full bodies — you're mapping, not studying.
2. **Carve dimensions.** Group the surface into a small set (typically 3–6) of **focused, low-overlap areas** a single gatherer can own without congesting. Good dimension axes:
   - a **module / subsystem** (the core code to change)
   - **call-sites / consumers** (who depends on it — the blast radius)
   - **tests** (what pins current behavior)
   - **conventions / patterns** (how this codebase does this kind of thing)
   - **data model / types / schema** (the shapes involved)
   Only include an axis if it's real for this task. Prefer fewer, well-bounded dimensions over many overlapping ones.
3. **Give each dimension concrete entry points** — exact files/dirs/symbols the gatherer should start from, so it doesn't re-discover the map.

Do **not** produce digests, snippets, or a plan. Just the map.

## Output

Write `SCOPE.md`:

```markdown
# Scope

## Request (one line)
[What the refactor/change is]

## Affected surface
[2–4 lines: where in the codebase this lives, at a glance]

## Gathering dimensions
### [dimension-slug] — [short name]
- **What to gather:** [the area's responsibility + what the planner will need from it]
- **Start from:** `path/to/entry.ts`, `path/to/dir/`, `SymbolName`
- **Depends on / couples with:** [other dimensions, if any]

### [dimension-slug-2] — ...

## Notes for gatherers
[Any cross-cutting warning: a generated file to skip, a huge file to sample not read whole, etc.]
```

Report back to the orchestrator: the dimension slugs and a one-line each, plus anything that made the split non-obvious.
