# ADR: Answer-Reveal Mode — a Per-Test Setting With a Per-Question Override

**Date:** 2026-09-07
**Status:** Accepted, implemented
**Deciders:** Project Owner

## Context

Before this feature, a free-text question's correct answer was always shown to a student as a GitHub-style side-by-side diff against the teacher's per-student solution. There was no way to show it any other way, and no way to vary the presentation per question.

The operator wanted a second presentation — the student's own answer and the correct answer written out as plain text, not compared — available as a choice, not a replacement.

## Decision

### The setting is a per-test default with a per-question override (D2)

`answerRevealMode` lives on the test document with two values, `"diff"` and `"plain"`. A question may carry its own `answerRevealMode`, which overrides the test's choice for that question only. Absence of a per-question value means "inherit the test's choice" — a real third state, never collapsed into a default at read time.

**Alternatives considered:**
- **Per-test only**, matching the shape of the four existing reveal flags (`showGradeAfterSubmit`, `showCorrectAnswerAfterSubmit`, etc.) — simpler, one field, no override machinery.
- **Per-question only**, matching the existing `mcGradingStrategy` precedent — no test-wide default to reason about.

**Why the blended tier won:** the operator wanted a test-wide default that individual questions can deviate from, not an all-or-nothing choice at either level. The cost is real: the per-question field has to be threaded through every place a question is authored or copied — including `PoolQuestion` and `composeFromPools` — or it silently drops when a question comes from a pool.

### The setting governs both student-facing reveal surfaces (D1)

`answerRevealMode` decides both the post-grading view (`graded-question.tsx`, comparing against the teacher's per-student `grade.solution`) and the practice-mode reveal (`test-questions-section.tsx`, comparing against the question's own `referenceAnswer`, since practice creates no grades at all).

**Alternative considered:** govern only the graded view, since that's where the diff already lived, and leave the practice reveal's model-answer-plus-explanation display hardcoded.

**Why one config wins:** a setting that only controls one of the two surfaces a student can see the answer on would leave the other surface's behavior arbitrarily fixed, with no way to explain why the same question looks different in practice versus after grading.

### The mode applies to free-text questions only (D8)

Multiple-choice questions keep their answer chips; image/handwritten questions keep the grader's annotation overlay. `answerRevealMode` is a no-op on both.

**Alternatives considered:** hide the setting's control entirely on non-free-text questions (functionally identical, more UI work); build a second "diff equivalent" for MC answer chips.

**Why:** the operator's own scoping — "only show diff for the free text, no need for other" — and neither MC's `isCorrect` flags nor an image answer has a single correct-answer string a diff could even be computed against.

### The defaults are deliberately asymmetric (D7 / D9)

- **`createTest` writes `answerRevealMode ?? "plain"`** — a newly created test with no explicit choice defaults to the plain, written-out presentation.
- **`toTest` reads `doc.answerRevealMode ?? "diff"`** — a test document with a missing field (every test that existed before this feature) is read back as the side-by-side comparison.

These are two different literals on two different functions, not one shared default.

**Alternatives considered:** one shared default read and written everywhere — `"diff"` for both (purely additive, no migration needed) or `"plain"` for both (simpler, one constant).

**Why the asymmetry wins:** a shared `"plain"` default would make every pre-existing, un-migrated test silently lose the comparison its students and teachers already know, the moment `toTest` runs. A shared `"diff"` default would work but would mean every *newly created* test — the intended house style going forward — keeps defaulting to the old presentation forever. The asymmetry is what lets "nothing already-seen changes" and "new tests get the simpler default" both hold at once. The cost, accepted explicitly: two tests can behave differently with no visible reason in the UI, and a one-time backfill migration is required to pin every pre-existing test's field to `"diff"` in storage rather than relying on the read-time fallback alone (belt-and-braces, not load-bearing — see below).

### Any write path that bypasses `createTest` must set the field explicitly

`createTest` writing `"plain"` only protects tests created through that one function. Anything that inserts a test document another way — a seed script, a raw `insertOne`, a future migration tool — gets none of that protection and reads back as `"diff"` via `toTest`'s fallback, silently, because a missing field and an explicit `"diff"` are indistinguishable to the reader.

This is not hypothetical: `scripts/create-test.ts` originally omitted `answerRevealMode` from its `updateTestSettings` call, so every test seeded by that script — including seed data files that requested `"plain"` explicitly — silently lost the intended default. The bug was invisible because `scripts/` is excluded from `tsconfig.json`'s type-checking and the existing test for that script asserted only `timeLimitMinutes`, not the reveal mode. It was found and fixed during this run; the backfill migration was widened at the same time to match `answerRevealMode: null` as well as a missing field, since the bug produced explicit-`null` rows (the MongoDB driver stores an `undefined` write as `null`), not just absent ones.

**The rule going forward:** any code that writes a test document outside `createTest` must set `answerRevealMode` explicitly. Both seed scripts in this repo (`seed-test-states.ts`, `seed-coding-test.ts`) do this today. There is no compiler or runtime check that enforces it — the only guard is this rule and code review.

### The per-question override's edit path (D12, superseded by D18)

This feature originally shipped the per-question override as create-time-only: authored in the add-question form (and its pool/CLI/AI-import equivalents), with no way to change it afterwards. The repository had no question-edit path of any kind at the time, and building one was judged out of scope for the display-config feature alone.

**This was superseded within the same run by D18:** the operator judged a set-once, never-changeable override unacceptable, so a full question-editing capability was built specifically to make the override (among other fields) correctable after creation. See `documents/features/question_editing.md` for the edit path itself — this ADR only covers what the override *is* and how it defaults, not how it's later changed.

## Consequences

### Positive

- A test keeps exactly the presentation its students and teachers already know unless someone actively changes it.
- New tests get a simpler default without a migration needing to touch them.
- A single question can depart from its test's choice for a good reason (e.g., a question with an unusually long or code-heavy answer) without changing the whole test.

### Negative

- Two functions (`createTest`, `toTest`) each hardcode a different literal for the same field. A refactor that "simplifies" this into one shared constant will silently break one direction or the other — this is the single most load-bearing piece of trivia in the whole feature.
- The per-question override state space is three-valued (`"diff"`, `"plain"`, absent-meaning-inherit), which every reader of `question.answerRevealMode` must handle correctly — collapsing "absent" into a default at the wrong layer reintroduces the same class of bug as a shared literal.
- Any future write path for test documents inherits the risk described above and must remember, unprompted, to set the field.
