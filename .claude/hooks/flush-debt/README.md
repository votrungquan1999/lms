# flush-debt hook

A `Stop` hook that nudges (never blocks) when the task workspace holds records newer than the last mirror to the AI-Kanban card. The workspace is scratch space the operator deletes without warning; the card is not. Anything living only in the workspace at the end of a turn is one `rm -rf` from being gone.

## Install (manual drop-in)

1. Copy `flush-debt.mjs` into the target project's `.claude/hooks/flush-debt/flush-debt.mjs`.
2. Deep-merge `settingsFragment` from `hook.json` into `.claude/settings.json` under `hooks` (append to `hooks.Stop`; don't overwrite an existing array).

## The session pointer contract

The hook is never told the task workspace — a Claude Code hook receives `session_id`, `cwd` and `transcript_path`, and `cwd` is not the workspace. So the **agent** leaves it in the pointer that `ai-kanban-track-session` already writes:

```
~/.claude/kanban-session-state/<sessionId>.json
```

```json
{
  "cardId": "<24-hex ObjectId>",
  "cardNumber": 42,
  "summary": "short card summary",
  "workspacePath": "/abs/path/to/task/notes",
  "lastMirroredAt": "2026-08-02T10:00:00.000Z"
}
```

- `workspacePath` — absolute path to the **task/notes folder**, the one holding `IMPLEMENTATION_PROGRESS.md`. Same name and same meaning as the card's own `workspacePath` field. Written once, when the card is opened.
- `lastMirroredAt` — ISO timestamp, **re-stamped every time the agent mirrors to the card**. This is what makes the debt clearable.

Both fields are new. A pointer without them is normal and the hook stays silent — see below.

### Three directories, only one of which is the workspace

A session typically has all of these, and they are usually different:

- **cwd** — often a container of many sibling repos. Useless as an identity key, which is why this hook never reads it.
- **code worktree(s)** — where the edits land. Tracked separately on the card as `repos[].worktreePath`.
- **`workspacePath`** — the notes folder. This is the one the hook watches.

`workspacePath` is **singular while `repos` is an array**, and that is deliberate: one task spanning several repos keeps a single set of notes, because a decision about a coordinated change belongs in one place. The hook has no concept of repos at all — one repo or five, its behavior is identical.

**Known limitation:** the pointer holds one card, and opening a second card with `forceNew` overwrites it. Unmirrored debt in the previous workspace then stops being watched — silently. Narrow, but it fails quietly, so it is recorded here rather than guessed at.

## Behavior on Stop

1. Read stdin (`session_id`, `stop_hook_active`).
2. `stop_hook_active` true → silent. See *Why the re-entrancy guard*.
3. Read the pointer. Missing, malformed, or lacking `workspacePath`/`lastMirroredAt` → silent.
4. Stat `DECISIONS.md`, `IMPLEMENTATION_PROGRESS.md`, `JOURNAL.md` in the workspace. An absent file is not debt — most workspaces never have all three.
5. Any file with `mtime > lastMirroredAt` → emit an `additionalContext` nudge naming those files.
6. Exit 0. Always — exit 2 on `Stop` would block the session from ending.

## Why the re-entrancy guard

`additionalContext` on `Stop` **continues the conversation** rather than annotating it, under the same loop protections as `decision: "block"`. Without a guard, the continuation ends in another `Stop`, which fires the nudge again, up to Claude Code's 8-consecutive-continuation cap. The sibling `spec-reminder` hook shipped without this and produced eight identical back-to-back nudges in a live session. `stop_hook_active` is true exactly when Claude Code is already continuing because of a stop hook, so returning silently on it breaks the self-trigger.

## Why the debt must be clearable

This is the lesson `spec-reminder` paid for. Its git-based check compared a spec path that could live outside the code's git repo, so the condition was **unsatisfiable** — editing the spec could never clear it, and the nudge fired forever.

Here the condition is satisfiable by construction: the agent mirrors, re-stamps `lastMirroredAt`, and the next `Stop` finds no file newer than it. A test asserts exactly this (*"every workspace file older than the last mirror → stays silent"*), because a nudge that cannot be cleared by doing what it asks is worse than no nudge at all.

## Why silence when the baseline is missing

Without `lastMirroredAt` the hook cannot distinguish unmirrored work from work mirrored an hour ago. It reports nothing rather than guessing — the same never-guess rule the promotion check follows. The practical effect: the hook is **inert until the agent starts writing both fields**, and it degrades to silence rather than to false alarms.
