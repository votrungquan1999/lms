# Node: Mutation Pass

Prove the suite would actually catch a defect, by injecting one and watching a test go red. Runs **once per run** in Phase 5c — never inside the Phase 4 loop.

> **Task workspace:** All state files live in the task working directory `<ws>` (`./tmp/<identifier>/`) given in your prompt. Every state-file path below is relative to `<ws>`.

> **You run ALONE.** Unlike 5a/5b you write to the source tree, so you cannot overlap with anything that reads or tests it. The orchestrator spawns you only after 5a and 5b have both returned.

> **Report only — never fix, never touch git.** A survivor is a finding for the operator to triage, not a licence to add tests or edit code.

## Input

- `<ws>/MUTATION_PLAN.md` — the operator's Phase 4·0 answer. **If `Mutation: off`, write nothing and return "skipped per run options" immediately.**
- `<ws>/IMPLEMENTATION_PROGRESS.md` — the behaviors implemented and the files each one changed. Mutate only those files.
- The repo's test command (check `package.json` / `pyproject.toml` — never hardcode a runner).

## The one rule that decides the cost

**Every mutant names only the tests that execute the mutated file.** A defect in `sizing.py` can only be killed by tests that run `sizing.py`; adding the other eight test files to that mutant costs 10-20x and finds nothing extra. A real run that passed all 9 target files to all 96 mutants spent 62 minutes to surface 8 findings.

`mutation-harness.py` refuses a mutant with no `tests` list, so this is enforced, not advisory — but it cannot tell a narrow list from a lazy one. Keep it to the mutated file's own test files.

## Budget

- **≤3 mutants per behavior, ≤30 per run.** Spend them on the riskiest thing the behavior introduced: a boundary (`>=` → `>`), a sign, a constant that encodes intent (a tilt, a threshold, a default), a branch that silently no-ops.
- **Stop early on a file once its mutants are all killed** — more of the same proves nothing new.
- Skip generated code, config plumbing, and anything the plan marked out of scope.

## Execution

### 1. Pick the mutants

For each implemented behavior, read its diff and choose up to 3 defects **a wrong implementation would plausibly have**. A good mutant is one you genuinely cannot predict the verdict for; if you already know a test pins it, it is a wasted minute.

Write them to `<ws>/MUTANTS.json`:

```json
[{"name": "B12 score tilt is ignored",
  "file": "src/quant/engine/sizing.py",
  "old":  "score_tilt_multiplier",
  "new":  "1.0",
  "tests": ["tests/engine/test_sizing.py"]}]
```

`old` must occur **exactly once** in the file — the harness rejects an ambiguous match rather than mutating a line you did not mean.

### 2. Run the harness

```bash
python3 <skill dir>/nodes/mutation-harness.py <ws>/MUTANTS.json <ws>/MUTATION_RESULTS.json \
  --repo <repo root> --test-cmd "<project test command>"
```

Never hand-roll your own harness and never mutate with `Edit` + `cp`: this one restores in a `finally`, aborts loudly if a restore fails, rejects a red baseline (against which every mutant reads as KILLED and the run proves nothing), and redirects bytecode caching so a same-length mutation (`2.5` → `1.0`, `max` → `min`) cannot leave a stale `__pycache__` that makes later runs execute the mutant.

Add the runner's own parallel flag to `--test-cmd` (`-n auto`, `--pool=threads`) if the project has it — that is the safe place to parallelize.

### 3. Triage the survivors

A SURVIVED mutant is one of three things, and only the first is a defect:

- **False green** — the behavior is real but nothing pins it. This is the finding. Name the test that should have caught it and what assertion is missing.
- **Equivalent mutant** — the change cannot alter observable behavior (dead config, an unreachable default). Not a gap; say why.
- **Out of scope** — the path is deliberately untested per the plan.

Re-read the test before classifying. Do not add the missing test — that is the operator's call, and a new test is a new behavior with its own commit.

### 4. Confirm the tree is clean

Run the project's test command over the mutated files one last time and confirm green, then confirm the source files are byte-identical to their pre-run state. A leaked mutant silently corrupts every later step.

## Output

Write `<ws>/MUTATION_RESULTS.md`:

```markdown
# Mutation Pass

**Budget:** [N] mutants over [M] behaviors · **Result:** [k] killed / [s] survived / [a] apply-fail

## Findings (false greens)
### [mutant name] — `[file]`
- **Defect injected:** [old] → [new]
- **Tests that should have caught it:** [paths]
- **Why they didn't:** [the missing or too-loose assertion]
- **Severity:** low | medium | high

## Not findings
- **[name]** — equivalent mutant: [why it cannot change behavior]
- **[name]** — out of scope per plan: [reference]

## Tree state
- Suite green after restore: yes | no — [detail]
```

Report back: counts, the false-green findings with severity, and confirmation the tree is clean.
