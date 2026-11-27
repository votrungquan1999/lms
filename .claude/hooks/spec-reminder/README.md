# Living-spec reminder hook

A `Stop` hook that nudges (never blocks) on a feature-dev session to update the living spec
(`docs/features/<slug>/spec.md`) before wrapping up. Event is `Stop`, not `SubagentStop` —
the orchestrator (`orchestrated-feature-dev`) spawns many sub-agents, and `SubagentStop` would
fire after every one of them, producing a nudge storm mid-pipeline. `Stop` fires once, when the
top-level session ends.

The nudge is purely advisory: the hook does **not** inspect git or try to detect whether a
spec-worthy change happened. It reminds on the sentinel alone (see below). See
[Why no change-detection](#why-no-change-detection) for the reasoning.

## Install (manual drop-in)

1. Copy `spec-reminder.mjs` into the target project's `.claude/hooks/spec-reminder/spec-reminder.mjs`.
2. Deep-merge `hook.json`'s `settingsFragment` into the project's `.claude/settings.json` under
   the `hooks` key (append to `hooks.Stop`, don't overwrite an existing array).
3. No other configuration is required — the hook has no external config or credentials, and does
   not shell out to any tool.

## Runtime convention: the sentinel

The hook reads a per-session sentinel file to know whether this session is feature-dev work,
and which spec to name in the reminder:

```
~/.claude/spec-reminder-state/<session_id>.json
```

```json
{ "slug": "my-feature", "specPath": "docs/features/my-feature/spec.md" }
```

- **Written by the feature-dev skill at Phase 0** (`orchestrated-feature-dev/SKILL.md` and
  `feature-dev-lite/SKILL.md`), right after the task `<slug>` is confirmed — *before* any code
  changes happen. Writing it at Phase 0 marks the whole session as feature-dev work.
- `specPath` is the living-spec path (`docs/features/<slug>/spec.md`) the reminder names. It is
  displayed verbatim in the nudge, not resolved or checked against the filesystem — so it works
  even when the spec lives outside the code's git repo (cross-repo / monorepo-root specs).
- No sentinel for the session = not a feature-dev session (or the skill didn't wire it) — the
  hook stays completely silent, unlike `kanban-track.mjs` which always emits *some* reminder.
  Whether a session is "feature-dev work" is exactly what's unknown without the sentinel, so
  there is nothing safe to say.

## Behavior on Stop

1. Read stdin (`session_id`, `stop_hook_active`).
2. If `stop_hook_active` is true → silent, exit 0. See *Why the re-entrancy guard* below.
3. Look up the sentinel for `session_id`.
   - Absent or malformed JSON → silent, exit 0.
   - Present → emit an `additionalContext` nudge naming `sentinel.specPath`, then exit 0.

Always exits 0 — exit 2 on a `Stop` hook would block the session from ending, which this hook
must never do.

## Why the re-entrancy guard

`additionalContext` on `Stop` is not a passive annotation — it **continues the conversation**, under the same loop protections as `decision: "block"`. So the continuation this hook causes ends in another `Stop`, which fired the nudge again, which continued again, until Claude Code's **8-consecutive-continuation cap** ended the turn. Observed live: a single un-updated spec produced eight identical back-to-back nudges, none of which the operator could clear by answering.

`stop_hook_active` is `true` exactly when Claude Code is already continuing because of a stop hook, so returning silently on it breaks the self-trigger while leaving the first nudge of each turn intact. This is the guard the Claude Code docs prescribe for `Stop` hooks.

**Deliberately not fire-once.** The guard stops a nudge re-triggering *itself*; it still nudges once per user turn while the spec is untouched. Suppressing that too would mean persisting a "already nudged" flag, i.e. a new automatic write into `~/.claude/`, which is out of scope here.

## Why no change-detection

An earlier version ran `git status` and only nudged when the tracked spec path was *not* among
the changed paths. That produced an **unsatisfiable false positive** whenever the spec lived
outside the git repo where code changed (a monorepo-root or cross-repo spec): `git status` in
the code worktree can never list a file sitting in a non-git parent, so the "was the spec
touched?" check was always false and the nudge fired on *every* Stop, forever — editing the spec
could never clear it. A subtler variant fired even inside one repo when `cwd` was a nested
subdirectory, because git reports repo-root-relative paths while the sentinel path was written
relative to the working directory.

Dropping the git check removes both failure modes at once. The trade-off: the nudge now fires on
every Stop of a feature-dev session, including sessions with no spec-worthy change. It is phrased
conditionally (*"if you changed feature behavior…"*) so it is never a false *claim* — just a
standing, non-blocking reminder.
