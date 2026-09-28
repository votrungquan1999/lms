# Node: Quality Gate

Periodic quality check that reviews recent tests and implementation for issues.

> **Task workspace:** State files live in the task working directory `<ws>` (`./tmp/<identifier>/`) given in your prompt.

## Input

Read `<ws>/PLAN_STEPS.md` to identify which steps were completed since the last quality check.

## Execution

### 1. Test Quality Review

Use `@test-quality-reviewer` to review the tests written in the most recent 2-3 steps.

Focus on:
- Are tests reliable (no flakiness)?
- Are assertions valid (actually proving correctness)?
- Are tests sensitive (would catch real bugs)? **Answer this by reading the assertion, not by injecting a defect** — see below.

**No mutation testing in this gate.** Do not edit source to see whether a test goes red, and do not build a mutation harness. That pass exists once, in Phase 5c, budgeted and running alone; doing it per gate re-mutates the same files 3-5 times a run, and one gate that did it spent 62 of its 68 minutes on 96 mutants. If you suspect a test is hollow, say so in your report — the 5c pass will settle it.

### 2. Code Refactoring Review

Use `@code-refactoring` to review the implementation from recent steps.

Focus on:
- Any duplication introduced across recent steps?
- Naming clarity?
- Unnecessary complexity?

**If `@code-refactoring` reports missing test coverage → skip the refactoring review** rather than blocking. The tests exist from the BDD scenario steps.

### 3. Apply Fixes

If issues are found:
1. Fix them immediately
2. Run all tests to confirm nothing broke
3. Note what was fixed
4. **Fold each fix into the behavior that owns it** — read `<ws>/COMMIT_PLAN.md`; if `Strategy: defer`, run no git commands. Under `per-behavior`, a refactor or test fix touching already-committed behavior code belongs in that behavior's commit, not a new one — follow the fold procedure in `nodes/commit-protocol.md`. A fix spanning several behaviors folds into each owning commit separately. If a fix's owning commit is already pushed, or a rebase conflicts, **stop and hand it back to the orchestrator** rather than forcing it.

## Output

Report the quality gate result:

```markdown
## Quality Gate: After steps [X-Y]

### Test Quality
- **Score**: [Excellent / Good / Needs Improvement]
- **Issues Found**: [count]
- **Issues Fixed**: [count]
- **Details**: [brief list]

### Code Quality
- **Refactoring Applied**: [yes/no]
- **Changes Made**: [brief list, or "none needed"]

### Overall
- **Quality**: pass | needs-fixes
- **Notes**: [anything the orchestrator needs to know]
```
