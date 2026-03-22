# Test Gap Analysis — MC Questions & Atomic Reveal

Audit of what's currently covered by integration tests and E2E tests, and what edge cases are missing.

---

## Integration Tests — Current Coverage

### `grade-service.test.ts`

| #   | Scenario covered                                                                              |
| --- | --------------------------------------------------------------------------------------------- |
| ✅  | Weighted average: Q1 weight=2 score=100, Q2 weight=1 score=0 → 66.67                          |
| ✅  | `autoGradeTest`: `single_select` correct → 100, wrong → 0                                     |
| ✅  | `autoGradeTest`: `multi_select` `all_or_nothing` with exact match → 100, partial → 0          |
| ✅  | `autoGradeTest`: `multi_select` `partial` with partial correct − wrong selections             |
| ✅  | `autoGradeTest`: free-text question is skipped (only MC graded)                               |
| ✅  | Grade persisted with score, feedback, timestamp                                               |
| ✅  | Optional per-student solution stored                                                          |
| ✅  | Re-grading updates score and feedback (upsert)                                                |
| ✅  | `getStudentGrades`: returns empty when `testStatus !== Graded`                                |
| ✅  | `getStudentGrades`: returns empty when both flags OFF and `gradesReleasedAt` is null          |
| ✅  | `getStudentGrades`: returns grades after `releaseGrades()` even when flags are OFF            |
| ✅  | Atomic reveal happy path: MC auto-graded on submit, hidden until free-text is manually graded |
| ✅  | Atomic reveal flags-OFF: fully graded but hidden until `releaseGrades()`                      |

### `test-submission-service.test.ts`

| #   | Scenario covered                                                                      |
| --- | ------------------------------------------------------------------------------------- |
| ✅  | `single_select`: correct selection → 100, wrong → 0; triggered by `submitTest`        |
| ✅  | `multi_select` `all_or_nothing`: exact → 100, partial → 0, over-selection → 0         |
| ✅  | `multi_select` `partial`: proportional score minus deduction for wrong picks; floor 0 |
| ✅  | Mixed test: only MC auto-graded, free-text stays null; status stays `submitted`       |

---

## Integration Tests — Gaps (not yet covered)

### GradeService

| #   | Missing edge case                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- |
| ❌  | `single_select`: student selects **no option** (empty `selectedIds: []`) → should score 0                            |
| ❌  | `single_select`: student selects **multiple** options (invalid; client prevents but service should not crash)        |
| ❌  | `multi_select` `partial`: student selects **all correct + no wrong** → should be 100, not over-penalized             |
| ❌  | `multi_select` `partial`: student selects **nothing** → score should be 0                                            |
| ❌  | `autoGradeTest`: option ID in student answer **does not exist** in question options → graceful 0, no crash           |
| ❌  | `getStudentGrades`: `showGradeAfterSubmit=true` but only **partial grades exist** (not all questions graded) → empty |
| ❌  | `getStudentGrades`: `showCorrectAnswerAfterSubmit=true` but `showGradeAfterSubmit=false` + no manual release → empty |
| ❌  | `getAverageScore` with **no grades at all** for student → should return `null`                                       |
| ❌  | `getAverageScore` with **equal weights** (default 1) vs **mixed weights** when some questions are ungraded           |
| ❌  | Re-grading an **auto-graded** MC question with a manual override (upsert should preserve `gradedBy`)                 |
| ❌  | `releaseCorrectAnswers` flag independently from `releaseGrades` (test the two-flag separation)                       |

### TestSubmissionService

| #   | Missing edge case                                                                           |
| --- | ------------------------------------------------------------------------------------------- |
| ❌  | Student submits test **twice** → second `submitTest` call should be a no-op (idempotent)    |
| ❌  | Student submits test **before answering any MC question** → auto-grading skips gracefully   |
| ❌  | Student submits test with **only free-text questions** (no MC) → no auto-grade is attempted |
| ❌  | `autoGradeTest` is called with a **non-existent test** → no crash, no grades created        |

### AnswerService

| #   | Missing edge case                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------- |
| ❌  | Submitting an MC answer **after** test is submitted → still stored (append-only) but grade is not re-triggered |
| ❌  | Legacy plain-string answer coercion: `getLatestAnswers` upgrades old answers to `{ type: "free_text", text }`  |

---

## E2E Tests — Current Coverage

| #   | Scenario                                                                            | Status |
| --- | ----------------------------------------------------------------------------------- | ------ |
| 1–9 | Account creation, auth, course/test setup                                           | ✅     |
| 10  | Admin creates **single-select** MC question via sidebar (options builder, radio UI) | ✅     |
| 11  | Student answers free-text + MC (radio), submits; sees "waiting to be graded"        | ✅     |
| 12  | Admin grades free-text question (Q2 MC was auto-graded at 100)                      | ✅     |
| 13  | Student sees weighted average score (atomic reveal unlocks)                         | ✅     |

---

## E2E Tests — Gaps (not yet covered)

### Admin Flows

| #   | Missing scenario                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------- |
| ❌  | Admin creates a **multi-select** MC question (checkboxes in options builder)                          |
| ❌  | Admin switches between type tabs (Free Text → Single Select → Multi Select) and form resets correctly |
| ❌  | Admin tries to submit MC question with **only one option** → validation error shown                   |
| ❌  | Admin tries to submit MC question with **no correct answer marked** → validation error shown          |
| ❌  | Admin overrides the auto-grade score on an MC question                                                |

### Student Flows

| #   | Missing scenario                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| ❌  | Student answers a **multi-select** question with checkboxes                                                         |
| ❌  | Student tries to submit test **without answering all questions** → progress shows < 100%                            |
| ❌  | Student submits test on a test where **both flags are OFF** → sees "results not yet available" (not just "waiting") |
| ❌  | Student views test after admin releases grades (`gradesReleasedAt`) on a flags-OFF test                             |
| ❌  | Student sees correct answer highlighted on MC question after reveal                                                 |

### Atomic Reveal Flows

| #   | Missing scenario                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ❌  | Mixed test where **student gets MC wrong** (score=0) — verify 0 is surfaced after full grade, not hidden                                            |
| ❌  | Test with **only MC questions** (no free-text) — all auto-graded, student should see results immediately after submit + `showGradeAfterSubmit=true` |
| ❌  | Test with **only MC questions** + flags OFF — student must wait for manual release                                                                  |

---

## Priority Recommendation

**High impact, quick to add (integration):**

1. Empty `selectedIds` → score 0 (service robustness)
2. Idempotent `submitTest` (prevents double auto-grading on retry)
3. `getStudentGrades` with partial grades (confirms atomic gate is solely status-based)

**High impact, covers real user friction (E2E):**

1. No correct answer marked → validation error (admin can't create a broken question)
2. Multi-select checkbox flow (the MC type that has no e2e coverage yet)
3. All-MC test with `showGradeAfterSubmit=true` → instant reveal after submit
