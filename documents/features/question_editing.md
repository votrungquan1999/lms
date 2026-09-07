# Question Editing and Deletion

## Overview

Before this feature, a question was write-once: created through the add-question form (or the AI import, or a pool), then permanently fixed. Fixing a typo, correcting a wrong model answer, or removing a bad question meant living with it or asking an admin to touch the database directly.

This feature lets a teacher edit every field a question can hold, including its type, and delete a question outright — on both a test's own questions and on questions authored in a question pool. Because a question may already have student answers against it, an edit or delete that could strand or invalidate that work is warned about first, in a modal that names the actual consequence, and every real change is recorded in an audit log a developer can read after the fact.

## User Roles

- **Admin/Teacher**: edits or deletes any question on a test or in a pool, sees the warning before a destructive save, decides whether to proceed.
- **Student**: unaffected by this feature directly — an edit that strands their answer is visible only through their score/answer no longer lining up with the question as it now reads.

## Acceptance Criteria

### Admin — Editing a Question

- [x] Admin can edit every field the add form can set: title, content, the free-text model answer and explanation, the answer-reveal override, the MC option list, and the question's type
- [x] Excluded from editing: `weight` and `mcGradingStrategy` (neither has a form control anywhere in the app, so an edit panel would smuggle in new authoring capability, not correct an existing choice) and media/attachments (the picker only knows newly uploaded files, not ones already attached)
- [x] Title and content are editable for every question type — no type is exempt
- [x] The answer-reveal override and free-text model answer are editable only on free-text questions; the explanation field is shared by MC and free-text
- [x] A save that clears a field (blank textarea, or clearing the reveal override) writes an explicit absence, not "no change" — clearing the override returns the question to inheriting the test's setting

### Admin — Confirming a Destructive Edit

- [x] A confirmation modal appears before a save whenever at least one student has already answered the question; when nobody has, the save is immediate and silent
- [x] The modal's wording is derived from what actually changed on this save, not a single generic warning: mild wording for title/body/reveal/model-answer/explanation edits; a "students who already answered will show as having chosen nothing" warning when the option list changes; a blanket "this invalidates every answer already given for it" warning when the type changes
- [x] The confirmation gate is on the form's submit event, not the Save button's click — pressing Enter inside a text field cannot bypass it
- [x] A save that does not touch the option list does not re-run the multiple-choice answer-key validation, so a question already flagged "Needs an answer key" stays editable through an unrelated field (fixing the title does not force the teacher to fix the answer key in the same save)
- [x] An MC question can carry one of two mutually exclusive admin-list flags: "Needs an answer key" (at least two options, none marked correct) or "Needs answer options" (fewer than two options). A question can never show both — a question with no options cannot meaningfully be missing its answer key, and there is no box to tick for it. Both flags are surfaced only, never enforced: neither blocks the question from being editable or answerable

### Admin — Rewriting Options and Changing Type

- [x] Rewriting an MC option list preserves the id of every option that is not removed; only a genuinely new option gets a freshly minted id
- [x] A teacher who keeps an option's id while rewriting its text can show a student a selection they never actually made — a known, accepted edge case, made diagnosable by the change log (below)
- [x] Changing a question's type clears the fields the new type cannot hold, so the stored question always agrees with its own type — nothing is left dormant for a later export or report to trip over
- [x] A cleared field's prior value is not lost — it is recoverable from the change log, by hand

### Admin — Deleting a Question

- [x] Admin can delete a question from a test or from a pool
- [x] Deletion is a soft delete: the row gains `deletedAt`/`deletedBy` rather than being removed
- [x] Deleted questions are excluded from question listings, from ordering (a newly created question is numbered from the live questions only, so it never collides with a tombstone's slot), from question counts, and from pool snapshot composition
- [x] The delete confirmation states the real consequence: an affected student's overall score changes (an unanswered question scores zero in the average), not that it resets to zero as a distinct event
- [x] Restoring a deleted question is not supported by the application — see Known Limitations

### Admin — Change Log

- [x] Every real edit or delete is recorded in an append-only `questionChangeLog` collection: which question, which test or pool, when, who, which fields changed, and the before/after values for exactly those fields
- [x] A save that changes nothing (a value-identical resubmission, including a rewritten-but-identical option array) writes no log row
- [x] A delete's or an options-rewrite's log row stores the **question's own prior content** — including the full option array with the ids that were in use — plus a count of how many students had answered at the time
- [x] The log never stores a student's submitted answer. It records what the *question* used to say, not what any student actually wrote, selected, or uploaded. Recovering a stranded selection's original option **text** is possible by looking up the id in the log's `before.options`; recovering what a student actually answered is not possible through the change log under any circumstance — that data, if it survives at all, lives only in the separate `answer` collection

### Admin — Question Pools

- [x] Pool questions get the same update and delete capabilities as test questions, both soft
- [x] No confirmation modal and no answered-student check on a pool edit or delete — pool questions carry no student answers, so there is nothing to strand
- [x] Editing or deleting a test's own copy of a pool-drawn question never touches the pool question it was drawn from, and editing the pool question never retroactively changes a test that already composed a copy from it — copies are independent rows with no backlink to their pool origin

## Known Limitations

- **The change log has no UI.** It is written on every real change and is queryable, but nothing in the app displays it. Reading it today means querying the `questionChangeLog` collection directly.
- **A deleted question cannot be restored through the application.** The tombstone stays in the database (that's what the soft delete is for — the underlying answer/grade data it stranded stays diagnosable), but there is no undelete action anywhere in the UI.
- **A change log row about a stranded MC selection can only recover the option's text, not restore the student's answer to a working state.** The student's grade and `selectedIds` still point at an id that no longer resolves to a live option.
