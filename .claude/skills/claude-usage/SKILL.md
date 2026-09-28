---
name: claude-usage
description: Reports what the current Claude Code session is costing — context size, carry cost per turn, session total, per-model split, and subagent spend. Trigger on "how big is my context", "what is this session costing", "how much have I spent", "am I near compaction", or any request to check context or cost. Current session only, fully local.
allowed-tools: Bash
---

# Session context and cost readout

Report what the **current session** is costing. Everything is local — no network, no transcript leaves the machine.

## Flow

Run the report:

```sh
node ~/.claude/claude-usage/bin/report.mjs
```

That resolves the transcript from `CLAUDE_CODE_SESSION_ID`, reads it in full, and prints context size, carry cost, turn count, session total, per-model split, and subagent spend.

If it fails with "No transcript found", the tool is not installed on this machine — see `~/.claude/claude-usage` (a symlink to the checkout). Say so rather than guessing at numbers.

## Presenting the result

Lead with **carry cost**, not the session total. Carry is what the next turn costs before the operator types anything — it is the only number that answers "should I start a fresh session", and it is the one people have no intuition for. On a large session it routinely exceeds two thirds of each turn's cost.

Then give context used, session total, and subagent share if non-zero.

Flag these when present:

- **Context past ~80%** — compaction is close, and carry is at its most expensive.
- **Subagents above roughly a quarter of spend** — worth knowing before delegating more.
- **A model showing `$?`** — its price is unknown, not zero. Never report an unpriced model as free.

Do not re-derive any of these numbers by reading the transcript yourself. The transcript runs to megabytes and the arithmetic has several traps the tool already handles (streaming duplicates, cache tiers, effective-dated prices).
