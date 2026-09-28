# Node: Summary

Generate a final summary of the entire orchestrated workflow execution.

> **Task workspace:** All state files live in the task working directory `<ws>` (`./tmp/<identifier>/`) given in your prompt. Every state-file path below is relative to `<ws>`.

## Input

Read all workflow state files:
- `<ws>/RESEARCH_OUTPUT.md`
- `<ws>/PLAN_STEPS.md`
- `<ws>/IMPLEMENTATION_PROGRESS.md`
- `<ws>/DECISIONS.md` (if present — the decision log)
- `docs/features/<slug>/spec.md` in the target repo (if it already exists — the living spec you will update below, not overwrite)

## Execution

1. **Count completed steps** from `<ws>/PLAN_STEPS.md` (all with status `done`)
2. **Gather quality gate results** from all quality checkpoints
3. **List all files changed** across all steps
4. **Check the commit invariant** — read `<ws>/COMMIT_PLAN.md`. Under `Strategy: per-behavior`, `git rev-list --count <base>..HEAD` must equal the number of behaviors with status `done`. Report the count either way; if they differ, say so plainly and name the likely cause (a fix committed separately instead of folded, or a behavior that never got committed) rather than quietly reporting success. Under `Strategy: defer`, skip this and note that the changes are uncommitted by design.
5. **Aggregate test/lint status** from what the run already recorded — each BDD step ran its own tests test-first and the quality gates re-ran the recent steps' tests, so the suite is already green. Do **not** re-run the whole project's test suite or lint the whole project here; it's slow and redundant. Only if a state file flags an unresolved failure, note it (and at most re-run that one step's tests).

## Output

Present to the user:

```markdown
# Feature Development Complete

## Summary
[One-paragraph description of what was built]

## Steps Completed: [X/Y]
| Step | Behavior | Result |
|------|----------|--------|
| 1 | [behavior] | ✅ done |
| 2 | [behavior] | ✅ done (already covered) |
| ... | ... | ... |

## Commits: [N commits / M behaviors]
[Under `per-behavior`: list each commit subject against its behavior, and state whether the counts match. Under `defer`: "no commits made — changes are in the working tree for you to commit."]

## Quality Gates: [X] checkpoints passed
- Checkpoint 1 (after steps 1-3): [pass/fixed N issues]
- Checkpoint 2 (after steps 4-6): [pass/fixed N issues]

## Key Decisions
[From `<ws>/DECISIONS.md` — each point where 2+ viable options existed and one was chosen. Omit this section only if the decision log is empty.]
- [choice]: chose [option] over [alternative(s)] — [why]

## Test/Lint Status
- [From per-step results + quality gates — e.g. "all step tests green; lint clean per last quality gate". Flag any unresolved failure a state file recorded.]

## Files Changed
- [file1]: [brief description]
- [file2]: [brief description]

## Notes
- [Any caveats, follow-ups, or things to watch out for]
```

## Durable Write: Living Spec

Before cleanup, write/update the feature's living spec so the "what" and "why" survive `<ws>` deletion.

- **Path:** `docs/features/<slug>/spec.md` in the **repo being worked on** (the consuming repo, not the skill repo), where `<slug>` is the Phase-0 task identifier passed in your prompt.
- **Contents:** what the feature does, its behaviors/ACs, and pointers to key files + PRs — drawn from `PLAN_STEPS.md`, `IMPLEMENTATION_PROGRESS.md`, and `DECISIONS.md`.
- **Reflect the FINAL state, not an early snapshot.** Re-read the final diff of the whole run and confirm the spec matches the *latest* behavior — not just that you touched it once. If the spec was written early and later steps changed behavior (new ACs, changed edge-case handling, dropped/added behavior), fold those in now. A spec that's present but stale relative to the last changes is the failure the `spec-reminder` hook can't catch — it only sees "touched," not "current." That judgment is yours here.
- **Update-in-place, don't blind-overwrite:** first search `docs/features/*/` for an existing spec for this feature. If one matches the `<slug>`, update it; only create a new folder when none matches — a wrong or new slug for the same feature silently forks the spec into two files.
- **No slug?** If this run has no Phase-0 identifier, derive a slug from the git branch or ask the operator; if none can be established, **skip the spec write** (don't guess a slug).

## Cleanup

After presenting the summary, remind the user that the entire task workspace `<ws>` (`./tmp/<identifier>/`) can be cleaned up once the feature is complete — it contains `RESEARCH_OUTPUT.md`, `PLAN_STEPS.md`, `implementation-plan.md`, `IMPLEMENTATION_PROGRESS.md`, and the per-step investigation/validation files.

`./tmp/` should be in `.gitignore`; delete `<ws>` once the feature is merged.
