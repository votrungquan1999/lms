# Step 3: Work the Card and Complete

The card is claimed and its workspace is declared. Now fetch the task, do the work in the worktree, and hand it back for review.

## Fetch the task context

```
get_card_context(<id>)
```

This returns the card's task: title, description, and the workspace bookkeeping you declared. Read it fully before starting. If you need to re-check the workspace paths mid-task, call it again — it is read-only.

## Do the work

- Work **inside the worktree(s)** under `workspaces/card-<N>/<repo>` — never in the parent checkout.
- Make commits on the `aikanban/card-<N>` branch as you go.
- Stay on this one card; do not pick up others.

### Log as you go

Two different signals, don't conflate them: progress is *what changed and where*, a decision is *the why behind a choice*.

- At **meaningful checkpoints** (a step finished, a blocker hit, a plan changed), leave a state-bearing note: `append_progress(<id>, <note>)`.
- At **real decision points** (a non-trivial choice, tradeoff, or reversal) — not every step — record the reasoning: `append_decision(<id>, <decision>, <why>)`. Keep `decision` under **200 characters** and `why` under **400**: past that the call is refused with `ERR_VALIDATION` naming the actual length, and you must rewrite it shorter and retry — skipping it loses the record. If a later decision reverses an earlier one, call `mark_decision_outdated(<id>, <index>, <supersededByIndex>)` so the log stays honest.

If a moment is genuinely both, log both — but don't restate the same text in each.

## Complete

When the work is ready for a human to review:

```
set_status(<id>, "need_review")
```

This moves the card `in_progress → need_review` (a legal agent edge) and records an audit row. If the tool returns a readable error (e.g. an illegal transition), read it and correct course rather than forcing the move.

## Park

After reaching `need_review`, **park** on the card: leave the session alive and the worktree in place, untouched. Do not remove the worktree, do not exit. The user can reopen this same session via Remote Control to steer it live or push the branch. End your reply with the card number, its new status, and the worktree path(s) so the headline result is visible without opening anything.
