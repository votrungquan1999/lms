# Plan: Per-Question AI Regenerate + Global Question Bank

Two independent features. Timed test mode was dropped from this plan — it is already
implemented (start gate, countdown, auto-submit, server-side deadline enforcement); the
README and `post-demo-improvements.md` were updated to reflect that.

Sequencing: **Feature A first** (smaller, self-contained, high value), then **Feature B**.
Feature A and Feature B have no dependency on each other.

---

## Feature A — Per-Question AI Regenerate

**Why:** Today AI grading is whole-student only — "Auto-grade with AI" and "Regenerate"
operate over every still-ungraded free-text question at once (`generateForStudent` /
`regenerateForStudent`). A teacher who is happy with most suggestions but wants a fresh
take on one answer must re-run the whole batch. This adds a question-scoped regenerate.

### Step A1: Service can generate/regenerate a suggestion for a single free-text question

**AC:** Triggering a question-scoped generate/regenerate produces (and, for regenerate,
appends to the append-only history of) a suggestion for **only that one question**.
Other questions' suggestions and any already-applied grades are untouched. Prior-grade
context is carried forward for that one question, matching the existing batch behavior.
Non-free-text, already-graded, or blank-answer questions are no-ops (same skip rules as today).

**Test Type:** unit (service)

### Step A2: Server action exposes per-question regenerate to the grading page

**AC:** An admin-only action regenerates a single question's suggestion, enforcing the same
`reason`-required validation as the existing whole-student regenerate. It targets exactly
the requested question and returns the new suggestion. Unauthorized or missing-reason calls
are rejected the same way the current action rejects them.

**Test Type:** integration (action)

### Step A3: Grading UI offers a per-question regenerate control

**AC:** Each free-text question's AI suggestion panel shows a regenerate control. Using it
re-runs AI for that question only; the new suggestion appears at the top of that question's
history without re-running the others. The whole-student "Auto-grade / Regenerate" controls
continue to work unchanged.

**Test Type:** component

**Risks/Notes:** Append-only history and the apply/skip semantics already exist and must be
preserved — this is additive scoping, not a rewrite of the AI grading flow.

---

## Feature B — Global Question Bank (pools) + compose test from pools

**Decisions (from requirements clarification):**
- Pools are a **global** bank, living above courses — any course's test can draw from any pool.
- Questions are **authored directly inside a pool** (a pool owns canonical questions).
- A test is **composed from pools once at creation**: the teacher pulls X from pool A, Y from
  pool B (multiple pools), and those questions are **snapshotted as regular test questions**.
  All students see the same set (no per-attempt randomization). This keeps the entire existing
  test-taking, grading, and results flow untouched — a composed test still owns concrete questions.

### Step B1: Operator can create and manage global question pools

**AC:** A teacher can create a pool (name, description), see the list of all pools, rename a
pool, and soft-delete one. Pools exist independently of any course.

**Test Type:** integration (service + action)

### Step B2: Operator can author questions directly inside a pool

**AC:** A teacher can add questions to a pool using the same question capabilities that exist
for tests today — free-text, single-select, multi-select, media attachments, and weight — and
list/edit the questions belonging to a pool. Pool questions are not tied to any test.

**Test Type:** integration (service + action)

### Step B3: Operator composes a test by pulling N questions from one or more pools

**AC:** While creating/editing a test, the teacher selects one or more pools and a count per
pool (with random or explicit selection), and confirms. The chosen questions are copied into
the test as independent, concrete questions. Editing or deleting a pool question afterward does
**not** change an already-composed test. Every enrolled student sees the same composed set.

**Test Type:** integration

### Step B4: Admin UI for the bank and the compose-from-pools flow

**AC:** A new top-level admin section lists pools and lets a teacher author pool questions; the
test-creation/editing screen gains a "Add from pools" path that drives Step B3. End-to-end, a
teacher can build a pool and compose a test from it through the UI.

**Test Type:** component / e2e

### Step B5 (optional): Programmatic compose-from-pools in `scripts/create-test.ts`

**AC:** The standalone test-creation script can reference pools and per-pool counts to compose
a test, mirroring the UI flow. Marked optional — implement only if the script path is needed.

**Test Type:** unit (script-level)

**Dependencies:** B3 depends on B1 + B2. B4 depends on B1–B3. B5 depends on B3.

**Risks/Notes:**
- **Snapshot semantics** are the crux: composed questions are independent copies with their own
  ids + `testId`. Media attachments reference the same S3 keys (read-only sharing is fine).
- Whether a composed question keeps a backlink to its source pool question (for future analytics)
  is an implementation detail to settle at Step B3 — not required by the ACs above.
- "Global bank" introduces a new top-level admin nav area outside the course hierarchy.
- The existing `post-demo-improvements.md` line describes question pools as *random-per-attempt*;
  this plan intentionally diverges to the chosen *fixed-at-creation* design. That doc line is left
  unchanged per the planning rule (plan changes go in new files).
```
