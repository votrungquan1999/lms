# AI Document Import

## Overview

Before this feature, a teacher who had test content in a Word document or PDF had no way to bring it into the LMS except retyping it through the add-question form, or hand-converting it into the CLI script's TypeScript format or the admin UI's JSON upload.

This feature lets a teacher upload a `.docx` or `.pdf`, have an AI extract the questions from it, review and correct the result, and import it onto a test — either appended after the existing questions or replacing them outright.

## User Roles

- **Admin/Teacher**: uploads a document, reviews the AI-extracted questions, corrects anything wrong, and chooses whether to append or replace.
- **Student**: unaffected by an append. A replace can change which questions they see and, in some cases, their submission status — see "Importing — Append or Replace" below.

## Acceptance Criteria

### Admin — Uploading and Extracting Text

- [x] Teacher can upload a `.docx` or `.pdf` file, up to 10 MB
- [x] Text extraction happens **in the browser** — `mammoth` for `.docx`, `pdfjs-dist` for `.pdf`
- [x] Only the extracted text is sent to the server; the document's bytes and any images never leave the machine
- [x] Extracted text is capped at a maximum length

### Admin — AI Parsing

- [x] The AI pulls a model answer and explanation out of the document when they are present
- [x] When the document never states an answer, the question imports with a **blank** model answer rather than a plausible-sounding fabrication
- [x] The AI is instructed not to invent, rephrase, summarize, or translate; a question stays in the language the document wrote it in
- [x] A document the AI finds no questions in says so plainly — nothing is written and nothing is offered to import, and the teacher can tell that outcome apart from a failed upload

### Admin — Reviewing Before Import

- [x] Teacher reviews the AI-extracted questions and can correct fields before anything is imported
- [x] Review drafts are not persisted; leaving the page discards them, with a warning first
- [x] A multiple-choice question can arrive with **no correct option marked**; it still imports, flagged "Needs an answer key" in the admin question list until the teacher fixes it
- [x] A multiple-choice question that arrives with **fewer than two options** gets its own "Needs answer options" flag instead
- [x] The two flags are mutually exclusive — a question with no options cannot meaningfully be missing its answer key

### Admin — Importing

- [x] Validation runs over the whole reviewed batch **before the first write**; if any question is unacceptable, it is named by position and title, and nothing is imported
- [x] Import writes through the same path a manually-added question uses, so a manually-added question and an imported one can never accept different things

### Admin — Append or Replace

- [x] Teacher chooses **Append** (the default) or **Replace** at import time
- [x] Append adds the reviewed questions after the existing ones, in review order, leaving existing questions untouched
- [x] Replace deletes the test's current questions first, then inserts the reviewed set; validation still completes before any delete
- [x] Replace requires the teacher to **type** a confirmation word before proceeding — a click alone is not enough
- [x] The replace warning states the real consequences: a student who explicitly submitted **stays Graded**; a student who was implicitly submitted **may** return to In Progress, and only when the replacement set is longer than the number of questions they had answered; every previously graded student's average **reads 0%** until the new questions are answered and graded, because the average scores an ungraded question as zero

## Known Limitations

- **No privacy notice** is shown on the upload screen, though the extracted text is sent to Google's API.
- **No transactions.** MongoDB runs standalone here, so a mid-loop infrastructure failure during Replace can leave the old questions deleted and the new ones partially written. Validation-before-delete removes the far more likely failure; this residual one is structural and cannot be fixed without transactions. What the application does do is tell the teacher: a failed replace says the test may already be partly changed and asks them to check it, rather than reporting a generic failure that reads as "nothing happened." Append's worst case is milder — a partial addition on an otherwise intact test.
- **A zero-option question blocks auto-submission.** Until a teacher adds options to a question flagged "Needs answer options," students cannot answer it, and a test only auto-submits once every question is answered. The flag is the mitigation for this; it does not prevent it.
