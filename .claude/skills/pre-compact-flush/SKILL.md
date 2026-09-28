---
name: pre-compact-flush
description: Writes everything durable-worthy out of the current context into the task workspace and the AI-Kanban card, so a compaction cannot lose it — then tells the operator it is safe to run /compact. Trigger when the user types "/pre-compact-flush", says "flush before compacting", "I'm about to compact", "save context before /compact", or asks to preserve the session's state before it gets summarized.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, mcp__ai-kanban-dispatch__append_decision, mcp__ai-kanban-dispatch__append_progress, mcp__ai-kanban-dispatch__update_card, mcp__ai-kanban-dispatch__mark_decision_outdated, mcp__ai-kanban-dispatch__get_card_context
---

# Pre-Compact Flush

You are about to lose your working memory. A compaction replaces this conversation with a model-written summary — and a summary keeps what reads as *important*, not what is *expensive to reconstruct*. Those are different sets. Your job here is to write the second set to disk before the first set is all that's left.

You cannot run `/compact` yourself. You prepare; the operator compacts.

## The selection test

Write it down if **re-deriving it would cost more than reading it**. That single test decides everything below.

**Write:**

- A **decision** and the alternative it beat. The code records the choice and never the rejected option — that half is gone forever if you don't write it.
- A decision that was **later overturned**, plus what replaced it. This is the highest-value entry and the easiest to lose: a summary that keeps the original and drops the reversal leaves a confidently-wrong record behind.
- An **open question** you have not resolved. These vanish silently — nothing else in the repo knows they were ever asked.
- A **finding that cost real effort** — a fact you verified, an assumption you refuted, a claim that turned out false.
- A **command or query** that took several attempts to get right.

**Don't write:**

- Which files you edited — `git status` and the diff already say so.
- What the code does — the code says so.
- A narrative of the conversation. You are writing records, not minutes.

When you're unsure, ask whether a competent person with the repo in front of them could work it out. If yes, skip it.

## The shape of an entry

The test above decides *what* you write. This decides *how long* — and it is the half that slips, because a flush happens under pressure and an over-full entry feels like safety. It isn't: the next session pays to read every word of it, before it knows which entry it needed.

One line for the decision, at most two for the why:

```
D7 — Dedicated feed item type (GroupedMarketInteractionFeedItem), not reuse of the Market-tab type.
     why: the two carry different fields and would drift apart; sharing one forces optional-everything.
```

- **Number them** — `D1`, `D2`, … Later decisions and progress notes cite the number (`per D11`) instead of restating the decision, which is what keeps *those* short too.
- **200 characters for the decision, 400 for the why — enforced, not advisory.** `append_decision` refuses anything longer with `ERR_VALIDATION` naming the actual length. That refusal is **not** a mirror failure to shrug off: rewrite the entry shorter and call again. Only a transport failure (no card, server unreachable) is skipped silently.
- **The why is the alternative and the reason it lost** — never the discussion that got you there.

This is measured, not stylistic: fifteen entries in this shape cost a resuming session ~1,500 tokens. Twelve entries written as prose cost ~4,500.

## Where each thing goes

Each type has exactly one home. Never write the same thing to two of them — except where a bullet says **and**, which means the card gets a copy because the workspace can be deleted and the card cannot.

- **Decision** → append to `<ws>/DECISIONS.md` **and** call `append_decision` on the active card.
- **Step transition / status change** → append to `<ws>/IMPLEMENTATION_PROGRESS.md`.
- **Open question, finding, or reusable command** → append to `<ws>/JOURNAL.md`.
- **A decision that is now superseded** → call `mark_decision_outdated` on the card and note the supersession in `DECISIONS.md`. Do not delete the old entry; a decision that was reversed is itself a record.
- **Where the work stands as a whole** → the card only, via `append_progress` **and** `update_card`. See *The card state note*.

`<ws>` is the task workspace you have been writing to this session — the folder holding `IMPLEMENTATION_PROGRESS.md` and any plan files. If you can't identify it, don't guess a path: see *No workspace* below.

**Decisions have two homes, but only one is worth reading back.** The next session orients from the **card** — it is the copy that survives a deleted workspace, and it is one call. Open `DECISIONS.md` only for what the card lacks: a mirror you know failed, or the surrounding prose. Loading both in full buys nothing and is the single most expensive thing a resumed session can do.

## The card state note

Every other entry above is a *record* — a thing that happened. This one is a *summary*: it answers "where is this work right now", and it is the only thing a fresh session gets before it has read anything.

- **`append_progress`** — one note: what is done, what is not, what is in flight. A few lines, not a transcript. If the previous note still describes the situation accurately, skip it rather than restate it.
- **`update_card` with `nextAction`** — the single next concrete step. This field is a pointer, not a log: it holds one line and is overwritten each flush, so a stale one is worse than an empty one.

Don't re-list decisions here; they are already on the card as their own entries.

## Flow

1. **Locate `<ws>`.** It's the folder you've written progress to this session. If you're unsure, call `get_card_context` — the card records it as `workspacePath` and `repos[].worktreePath`. Confirm it exists before writing.
2. **Scan your own context** against the selection test. Go back to the start of what you can still see, not just the last few turns — the oldest entries are the ones a summary has already thinned.
3. **Append** each item to its home. Always append; never rewrite or reflow an existing file, and never renumber existing entries.
4. **Mirror decisions to the card**, including any supersessions.
5. **Write the card state note** — `append_progress`, then `nextAction`. Do this last, so it reflects everything you just wrote.
6. **Re-stamp the session pointer** (below).
7. **Report and hand off** (below).

## Re-stamp the session pointer

Everything above is useless if the next session can't find the card. It resolves one from `~/.claude/kanban-session-state/$CLAUDE_CODE_SESSION_ID.json` — and when that file is missing it falls through to a board search and a re-adoption, paying for both before it has read a single record. Rewrite the pointer here, whether or not you think it already exists.

```json
{
  "cardId": "<active card id>",
  "cardNumber": 0,
  "summary": "<task name>",
  "workspacePath": "<absolute path to `<ws>` — omit the key if there is none>",
  "lastMirroredAt": "<ISO timestamp of this flush>"
}
```

Write the whole object, not a patch. `cardId` + `cardNumber` + `summary` are what the `kanban-track` hook needs to name your card next turn — it ignores a pointer missing any of them — and `workspacePath` + `lastMirroredAt` are what `flush-debt` compares file mtimes against. A fresh `lastMirroredAt` also clears the debt you just settled by mirroring.

Best-effort, like every other card call here: no session id, or a failed write, means say so in the report and move on. Never block the handoff on it.

## No workspace

A session with no task workspace still has things worth keeping. Write them to the **card alone** — `append_decision` for decisions, then the card state note. That path needs no `<ws>` and is the more durable of the two anyway.

If there is no workspace *and* no card, say so plainly and ask whether to open a card before compacting. Don't invent a folder to write into.

## Finish

Report what you wrote: the counts per file, one line naming each decision recorded, the `nextAction` you left on the card, and whether the pointer was written. Then state explicitly that **the operator can now run `/compact`** — you cannot trigger it.

Name anything you deliberately left out, and anything you were unsure whether to keep. An entry you skipped is fine; an entry you skipped *silently* is the failure this skill exists to prevent.
