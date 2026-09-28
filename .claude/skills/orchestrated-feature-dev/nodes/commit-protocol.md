# Commit Protocol

How this run turns behaviors into commits. Read this whenever you are about to commit, or about to fix code that is already committed.

> **Task workspace:** `<ws>` (`./tmp/<identifier>/`) is given in your prompt. Paths below are relative to it.

## The two strategies

The orchestrator asks the operator once, before implementation starts, and records the answer in `<ws>/COMMIT_PLAN.md`. **Read that file before touching git** — if it says `Strategy: defer`, never run `git commit`, `git rebase`, or `git add` at all.

- **`per-behavior`** — one commit per behavior, made as soon as that behavior is green. Every later fix to that behavior folds back into its commit. The branch ends with **exactly one commit per behavior** in the plan.
- **`defer`** — the run never commits. Changes accumulate in the working tree and the operator commits at the end.

## `<ws>/COMMIT_PLAN.md`

```markdown
# Commit Plan

Strategy: per-behavior | defer
Base: <sha captured before the first behavior commit>
Branch: <branch name>

| Step | Commit subject | Status |
|------|----------------|--------|
| 1 | feat(market): a trader sees trending markets at the top | committed |
| 2 | feat(market): markets below the score threshold are excluded | pending |
```

**The map stores subjects, not SHAs.** Every autosquash rebase rewrites the SHA of the folded commit and everything after it, so a recorded SHA goes stale the first time anything is folded. A subject is stable — resolve the SHA when you need it (see below).

## Committing a behavior

After the behavior is green and its tests pass:

1. **Stage explicit paths only** — the files listed under "Files Changed" for this step. Never `git add -A`, `-a`, or `.`; the working tree may hold unrelated work.
2. Commit with a subject naming the behavior, in the repo's existing convention (e.g. `feat(scope): <behavior>`). One behavior, one commit.
3. Record the row in `<ws>/COMMIT_PLAN.md` with `Status: committed`.

If this is the first behavior commit of the run, capture `git rev-parse HEAD` into `Base:` **before** committing.

## Folding a fix into the behavior that owns it

Any fix to already-committed behavior code — quality-gate refactor, conformance fix, an accepted adversarial finding — belongs in that behavior's commit, not a new one. Otherwise the commit count drifts above the behavior count.

1. **Resolve the owning commit by subject**, not by a remembered SHA:
   `git log --format='%H %s' <base>..HEAD` and match the subject from `COMMIT_PLAN.md`.
2. **Check it hasn't been published** — see the escalation rule below.
3. Stage explicit paths, then:
   ```
   git commit --fixup <sha>
   GIT_SEQUENCE_EDITOR=true git rebase --autosquash <base>
   ```
   `GIT_SEQUENCE_EDITOR=true` is what makes the rebase non-interactive — without it the rebase hangs waiting for an editor.
4. Re-run the affected tests after the rebase. A clean autosquash still reorders work; confirm green before moving on.

**A fix that introduces genuinely new behavior is not a fold.** It is a new plan step, and it gets its own commit — the invariant is one commit per behavior, so adding a behavior adds a commit.

## Safety rails

- **Never rewrite a published commit silently.** Before folding, check whether the owning commit is already on the remote (`git branch -r --contains <sha>`, or compare against `@{upstream}`). If it is, **STOP and escalate** — the operator chooses between folding plus `git push --force-with-lease`, or an ordinary follow-up commit that breaks the one-per-behavior count. Never force-push on your own initiative.
- **Never rebase a dirty tree.** Stage and commit (or stash) the fix first; an autosquash over uncommitted changes loses them.
- **A rebase conflict is an escalation, not a puzzle to solve.** Stop and hand it back. Never resolve with `-X ours` / `-X theirs` — it silently discards one side.
- **Only one agent touches git at a time.** Parallel sub-agents committing or rebasing the same branch corrupt each other's history. Verification sub-agents (conformance, adversarial) run in parallel and therefore **report findings only — they never stage, commit, or rebase**; the single fix sub-agent that follows does the git work.
- **Verify before you rely on it.** `git rev-parse --show-toplevel` first — the working directory drifts between nested repos and worktrees.
