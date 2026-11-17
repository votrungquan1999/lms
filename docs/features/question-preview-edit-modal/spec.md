# Question Preview and Edit Modal

## Feature Summary

A teacher sees every saved question the way a student sees it, with a teacher-only strip for the answer key and settings, and edits it in an Edit modal instead of an always-open form. The modal also changes a question's pictures and videos, protects unsaved typing, and keeps text that names a picture correct when pictures are removed or reordered. It covers the test page, the Question Bank (pool) page and the AI import review screen.

## Behaviors and Acceptance Criteria

**Behavior 1: Test page preview.** Each test question is drawn with the shared student question card plus a teacher strip.
- **Card.** Heading "Question N: title", the full content (no 200-character cut), the type label and the question's pictures, from `StudentQuestionCard`. Edit, Delete and badges sit in the card's optional header slot, which the student page leaves empty.
- **Teacher strip.** Multiple-choice options with their correct marks and the grading rule, a free-text model answer and reveal setting, the explanation, the answered-student count, and the mutually exclusive "Needs an answer key" and "Needs answer options" badges.
- **Order.** Questions are sorted by `order` then `id`, so equal orders never swap.

**Behavior 2: Test page Edit modal.** Edit opens a wide scrolling dialog ("Edit question") around the edit form; the form is no longer always open.
- **Shell.** One shared modal shell (`src/components/question-edit-modal.state.tsx`) serves the test page, the Question Bank and import review; each screen keeps its own form.
- **Save.** A successful save closes the modal and the preview shows the change after the page refreshes. A refused save keeps the modal open with its message.
- **Answered students.** The "students already answered" confirmation opens on top of the modal; Cancel keeps the modal and its typing, Save anyway saves.

**Behavior 3: Picture-answer questions.** Every question type, including picture-answer, offers Edit for title, content and type.

**Behavior 4: Pictures and videos on a test question.** The modal lists the question's pictures and videos with Remove and offers a picker for new PNG, JPEG, WebP and MP4 files, at most 3 files in total.
- **One save.** New files upload when Save is pressed, then one save carries the text changes and a picture diff: the keys the teacher removed plus the new uploads. A refused save after an upload leaves the new files in storage, and pressing Save again in the same modal reuses the files already uploaded instead of uploading them again.
- **Merge rule.** One shared pure function (`applyMediaChange`) applies the diff to the question's current pictures read at save time, so a picture another teacher added meanwhile is kept. It ignores a removed key the question no longer holds, refuses a new key that repeats, is already held or is also listed as removed, checks the maximum of 3 on the merged result and renumbers `order`. It is used by the test-question and Question Bank saves.
- **Confirmation.** When students have answered, the confirmation names "the pictures and videos" as changed.

**Behavior 5: Storage cleanup.** After a successful save, files the save dropped are deleted unless a live test question or Question Bank question still lists the same key.
- **Shared keys.** A test question composed from a pool question shares its keys, so removing the picture from one keeps the file.
- **Failures.** A refused save deletes nothing; a storage delete error is logged and the save still succeeds.
- **References.** Only a question's `media` counts as a reference; a picture link inside text does not. Questions inside deleted tests or courses still count, which errs toward keeping files.

**Behavior 6: Question Bank preview.** Each pool question is drawn like Behavior 1, with its options, correct answers, settings and pictures. Pictures use presigned URLs and the page is always rendered fresh. There is no "needs answer key" badge here.

**Behavior 7: Question Bank Edit modal.** Same shell and rules as Behavior 2, without the answered-students confirmation (pool questions have no answers).

**Behavior 8: Question Bank pictures.** Same controls, one save and merge rule as Behavior 4, and the same storage cleanup as Behavior 5.

**Behavior 9: Import review preview.** Each AI import draft is drawn with the student card plus a teacher strip carrying the answer key and picture checks. The strip keeps its own markup (answer marks, formatted model answer and explanation) rather than sharing the test-page strip.

**Behavior 10: Import Edit modal.** Edit opens the shared modal in place of the in-card form. Save records one undoable change; saving with nothing changed records nothing, and a Model answer or Explanation that is only spaces counts as empty, so a draft holding one saves unchanged without a history entry.

**Behavior 11: Import pictures.** The modal removes pictures and adds image files (PNG, JPEG, WebP, 10 MB each, at most 3 counting kept ones). A new file gets the next free `[image N]` number and a local preview; a number is never reused in one modal session, even after its file was removed. The title, content and option hints ("Shows as Picture k", "Names a picture this question does not have") follow the pictures in the modal now, kept and newly added, not the saved draft. Nothing uploads until Import. A Save that changed only pictures still marks the draft hand-edited.

**Behavior 12: Closing safely.** Escape, an outside click, the X and Cancel all go through one check.
- **Unsaved changes.** The modal asks "Discard your changes?" with Keep editing and Discard; with no changes it closes at once. Typing a field back to its original value counts as no change; removed or picked pictures count as changes.
- **While saving.** The fields lock and the modal cannot be closed until the save finishes.

**Behavior 13: Picture references stay correct.** Question text that names a picture follows that picture when pictures are removed or reordered.
- **Stored link.** A title, content or option names a picture by `{{picture:<media key>}}`. The label is never stored: students and teachers see "Picture k", where k counts pictures only (videos are skipped, as in `QuestionMedia`) in the question's current saved order. A link whose picture is gone shows "(picture removed)". A text that is only links, all of whose pictures exist, reads "Picture 2" or "Pictures 1, 2".
- **Where it resolves.** `QuestionService` and `PoolQuestionService` resolve links where a stored document becomes a `Question` or `PoolQuestion`, so every consumer (student test page, graded view, grading screens, the AI grading prompt, the results report and PDF) sees labels without per-screen code. Callers that edit text (the admin test page, the Question Bank page) read with `{ raw: true }`, pass raw text to the modal and resolve the preview and the test page's Student view tab themselves. Pool-to-test copies copy text and media keys verbatim, so links resolve in the copy.
- **Typing in the modal.** Links open as `[image N]`, N being the picture's number when the modal opened; the number stays fixed while pictures are removed, and the modal labels each picture with it. A newly picked picture gets the next number above all opening numbers. Save turns each `[image N]` back into a link (kept, removed or newly uploaded picture). A field the teacher did not change is saved exactly as stored, even when old text literally says `[image 1]`, so an unchanged question saves byte-identical text, records no change-log row, and sends no options. The dirty check, the answered-students change labels and the "options unchanged" test compare against the opening text with markers.
- **Warning.** When any text holds an `[image N]` with no matching kept picture, or a link left without its picture, the modal shows "Option 2 names a picture you removed - update it" (or "The title" / "The content") below its picture list. It never blocks Save. The check (`src/lib/picture-references.ts`) is the one import review uses, and fires for markers anywhere in the text, not only marker-only text.
- **Server check.** A save or import whose text links a key the question does not hold, or a video, is refused with "Invalid media key". A link to a picture removed by the same save, or already present in the saved text, is allowed (the dangling case above).
- **AI import.** Import writes `{{picture:<uploaded key>}}` for each `[image N]` instead of freezing "Picture k". A marker for a picture that is not attached stays as written and is already refused earlier by the missing-picture check.
- **Old text.** Plain "Picture N" text is never converted or touched; only text imported or edited after this change carries links, and old text does not renumber.

## Decisions Worth Knowing

- **Picture changes ride in the existing question save** as a diff (keys removed and new uploads), so one button press sends one mutation and concurrent picture edits merge.
- **Link key is the full media key**, so the server checks ownership with a string compare, and the shared service chokepoint covers consumers added later.
- **Typed `[image N]`, no insert button.**
- **A link to a removed picture is kept** and shown as "(picture removed)" rather than auto-deleted.

## Known Limitations

- A save that fails after new files uploaded leaves those files in storage; a retry in the same modal reuses them, but files of a failed save that is then abandoned (Cancel or Discard) stay in storage.
- Concurrent picture edits merge (a picture another teacher added is kept; a merged result over 3 is refused), but text is last write wins.
- Old plain "Picture N" text does not follow reordering or removal.
- A text field the teacher edits that literally contains `[image N]` is read as a reference on Save whenever N is the number of a picture the modal opened with (kept or removed) or of a newly picked picture; it cannot be kept as plain text. A field left untouched is never converted.
