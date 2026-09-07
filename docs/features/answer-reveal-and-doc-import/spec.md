# Answer reveal display and AI document import

How a student is shown the correct answer after a test, and how a teacher turns a Word or PDF document into questions on that test.

Two features shipped together because both change what a question holds and who may see it.

## Feature A: choosing how an answer is revealed

### The setting

A test carries an answer-reveal mode with two values:

- **`plain`** — the student sees their own answer and the correct answer written out as text, side by side in prose, not as a comparison.
- **`diff`** — the student sees their answer and the correct answer in a GitHub-style side-by-side comparison that highlights the differences.

A single question may override its test's mode. Absence of an override means "inherit the test's choice" — it is a real third state, distinct from either value, and is never collapsed into a default at read time.

The mode applies to **free-text questions only** (D8). Multiple-choice and image questions are untouched by it.

### Defaults, and why they are asymmetric

- A **newly created** test defaults to `plain`.
- A test that predates this feature, or any document still missing the field, reads as `diff`.

This asymmetry is deliberate and load-bearing (D7/D9): `createTest` *writes* `?? "plain"`, while `toTest` *reads* `?? "diff"`. Existing tests keep exactly the presentation their students and teachers already know, while new tests get the simpler default. Collapsing these into one shared constant silently breaks one half or the other.

Anything that inserts a test document **without** going through `createTest` — seed scripts, raw `insertOne` — must set `answerRevealMode` explicitly, or it inherits the legacy `diff` reading. Both seed scripts do this.

### What the student sees, and when

The correct answer stays withheld until the teacher releases correct answers for the test. Before that moment the student sees only their own submitted answer. This gate applies in **both** modes — closing a pre-existing leak where the comparison view ignored it (D31).

In plain mode, when the teacher set no per-student solution, the display falls back to the question's authored model answer (D34). A student who scored full marks still gets the correct answer without having to expand anything — the AI grader omits a per-student solution on a perfect score, so that student is exactly who the fallback exists to serve.

The teacher's explanation becomes visible alongside the answer once answers are released (D11/D19).

Identical-answer suppression — hiding the comparison when the student's answer already matches the solution — applies in **side-by-side mode only** (D35). The setting carries help text saying to turn it on when you want the student's answer to match yours exactly before they see it.

Practice mode keeps its own separate reveal gate and is not governed by the correct-answer release (D39).

### The reveal is enforced on the server

The model answer and explanation are removed from the payload on the server before it reaches the browser, per question, based on submission state — not merely hidden in the rendered page (D13). A student who has not submitted cannot recover the answer from the network response.

The gate is `practiceRevealOpen(q) || (hasGrade(q) && !canAnswer && correctAnswersVisible)`. Each conjunct is load-bearing.

## Feature B: generating questions from a document

### What a teacher does

The teacher uploads a `.docx` or `.pdf`, reviews the questions the AI extracted, corrects anything wrong, and imports the set onto the test.

Text extraction happens **in the browser** — `mammoth` for Word, `pdfjs-dist` for PDF. Only the extracted text is sent onward; the document's bytes and images never leave the machine.

Limits: 10 MB per file, plus a cap on extracted text length.

### The AI extracts; it never invents

The AI pulls a model answer and explanation out of the document when they are present. When they are absent they arrive **blank** (D6/D32). A question whose answer the document never stated is imported with an empty model answer rather than a plausible-sounding fabrication.

The prompt forbids inventing, rephrasing, summarizing, and **translating** — a question stays in the language the document wrote it in (D6/R42).

A document the AI finds no questions in says so plainly. Nothing is written and nothing is offered to import, and the teacher can tell that outcome apart from a failed upload (R39).

For multiple-choice questions this means a question can arrive with **no correct option marked**. That is allowed on purpose: an import is never held hostage to one incomplete question. Such a question is flagged in the admin list with a "Needs an answer key" badge until the teacher fixes it.

A multiple-choice question that arrives with **fewer than two options** gets its own distinct flag (D72). The two flags are mutually exclusive: a question with no options cannot meaningfully be missing its answer key, and telling the teacher to add an answer key when there is no box to tick is not actionable.

### Import is all-or-nothing

Validation runs over the whole reviewed batch **before the first write**. If any question is unacceptable, it is named by position and title against its own card in the review list, and **nothing is imported** (D15).

The import writes through the same `addQuestion` path a manually-added question uses, so the two cannot drift apart in what they accept. The relaxed answer-key rule is scoped to the import path alone and does not leak into manual creation.

### Appending versus replacing

- **Append** (the default) adds the reviewed questions after the existing ones, in review order, leaving existing questions alone.
- **Replace** deletes the test's current questions first, then inserts. Validation still completes before any delete.

Replace is destructive, so it warns and requires the teacher to **type** a confirmation word — a click alone is not enough (D45). The friction is the point.

The warning states the real consequences, which are narrower than they first appear:

- A student who explicitly submitted **stays Graded**.
- A student who was implicitly submitted **may** return to In Progress — only when the replacement set is longer than the number of questions they answered.
- Every previously graded student's average **reads 0%** until the new questions are answered and graded, because the average scores an ungraded question as zero.

Review drafts are not persisted. Leaving the page discards them, with a warning first (D42).

## Editing and deleting questions

A teacher may edit **every field** an add form can set, plus the question's type (D29/D46/D52). Destructive edits are allowed but warned about in a modal that names what specifically changed and how many students have already answered.

- Option ids are **preserved** for options that were not removed (D53), so existing student answers stay attributable.
- Changing a question's type **clears fields the new type cannot hold** (D54). The stored document always agrees with its own type.
- A save that does not touch the options does not re-validate them. This is what keeps a keyless multiple-choice question editable — otherwise the badge would point at a question the application refuses to save (D69).

Deleting a question is a **soft delete** (`deletedAt`/`deletedBy`). Tombstones are excluded from question listings, ordering, counts, and pool snapshot composition.

Every change is recorded in an append-only `questionChangeLog` collection with a full before-image, including the entire option array with its ids. That is what lets someone later work out which option text a stored option id referred to, after the option list has been rewritten.

The change log records the **question's** prior content and a count of affected students. It does **not** store any student's submitted answer. Deleting or replacing a question does not preserve the answers given to it anywhere retrievable through the application.

Question pools get the same edit and delete capabilities, both soft. A pooled question keeps the display mode it was written with, and editing a test's copy never touches the pool it came from, or vice versa.

## Known limitations

- **The change log has no UI.** It is written and queryable, but nothing in the app displays it (D48).
- **A deleted question cannot be restored** through the application. The tombstone is in the database, but there is no undelete path.
- **A question with no options blocks auto-submission.** Until a teacher fixes it, students cannot answer it, and a test only auto-submits once every question is answered. The flag is the mitigation; this was an accepted trade (D72).
- **No privacy notice** is shown on the upload screen, though the document's text is sent to Google (D38).
- **No transactions.** MongoDB runs standalone here, so a mid-loop infrastructure failure during Replace can leave the old questions deleted and the new ones partially written. Validation-before-delete removes the far more likely failure; this residual one is structural and cannot be fixed without transactions. What the application does do is **tell the teacher**: a failed replace says the test may already be partly changed and asks them to check it, rather than reporting a generic failure that reads as "nothing happened" (R40). Append's worst case is milder — a partial addition on an otherwise intact test.
- **The per-question override is set at creation time** in the add form; changing it afterwards happens through the edit panel.
