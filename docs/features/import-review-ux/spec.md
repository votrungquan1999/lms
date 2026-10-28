# Import review UX

Living spec for the review screen of "Import Questions with AI" in the LMS admin. It describes what the code does now. Pictures, AI provider choice and usage records are in [import-picture-reliability](../import-picture-reliability/spec.md); the Student view toggle is in [student-view-preview](../student-view-preview/spec.md).

- Branch: `test/real-ai-import-e2e`, 17 behavior commits on base `cce6697`.
- Code: `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/import-ai/` (`import-ai-form.state.tsx`, `question-preview.ui.tsx`, `question-edit.state.tsx`, `unused-pictures.ui.tsx`, `actions.ts`), plus `src/app/admin/(dashboard)/leave-guard.state.tsx`, `guarded-link.tsx`, `admin-sidebar.tsx`, `layout.tsx`, `src/lib/ai/ai-failure-cause.ts`, `ai-failure-messages.ts`.
- Tests: Vitest in the `import-ai/__tests__/` folder; Playwright in `e2e/import-ai-flow.test.ts`, `import-ai-pictures-flow.test.ts`, `import-ai-leave-guard.test.ts`.

## What the page is

- A teacher (admin) picks a .docx or .pdf of exam questions. The browser extracts the text and pictures; the server asks an AI to turn the text into draft questions.
- The teacher reviews the drafts (edit, delete, move pictures, retry one with the AI) and then imports them onto the test. Nothing is written to the test until Import is clicked.
- A **draft** is one AI-read question on the review screen. A **read** is the AI call for the whole document. A **retry** is the AI call for one draft.
- **Work on screen** means a read is running, or at least one draft is listed, or there is anything in the undo history. Leave guards and the new-file confirmation key off this.

## Reading a file

- While a read runs, "Reading <file name>…" with a spinner shows under the file picker. It names the file because the native file input is cleared on every pick. The file picker is disabled.
- If a list from an earlier file is on screen, the status adds "The list below is from your previous file." and that list (Teacher and Student view) is dimmed and marked busy.
- While reading or importing, everything that changes the list is disabled: Edit, Delete, Retry with AI, picture Remove, Move, Add picture, Undo, Redo, the Add/Replace choice and Import. While a read runs, open edit forms lock their fields, Add option, Remove and Save but keep what was typed; their Cancel stays enabled. An import cannot start with a form open, so forms never need locking for it.
- A retry does not show the reading status. It only shows "Retrying…" in its own dialog.
- A successful read replaces the list, clears the history and all per-question errors, clears any old page-level import error and shows the new list in Teacher view with no edit forms open.
- If a read call never answers, the browser gives up after 300 seconds and shows the timeout message. That is the server's own AI limit (240 seconds, `AI_CALL_TIMEOUT_MS` in `src/lib/ai/ai-call-timeout.ts`, which both sides import) plus one minute.
- A thrown read call (for example a dropped connection) shows the "busy" message and leaves the picker usable.

## Picking a new file over a list

- A file with the wrong extension (not .docx/.pdf) or over 10 MB is rejected at once with an error that names the file. No confirmation appears and the current list stays.
- Any other file, when work is on screen, opens "Replace the questions on screen?" naming the file and saying reading takes about a minute. Buttons: Cancel, "Read and replace". Cancel reads nothing.
- With no work on screen the file is read straight away.
- The file input is cleared after every pick, so choosing the same file again still triggers the flow.
- The native file input is visually hidden (still focusable and labelled "Document (.docx or .pdf)"). A visible "Choose file" button opens it and is disabled while a read or import runs. Beside it the screen shows the file being read, else the last file read successfully (kept when a later read fails, cleared by Reset), else "No file chosen".
- A failed read of any kind (damaged file, no text, no questions found, AI failure, give-up) keeps the old list and its pictures on screen and shows the error above it, starting with the name of the file that was rejected (for example "notes.txt — Upload a .docx or .pdf file."). The error stays until the next read attempt.
- Damaged or password-protected files, and files with no readable text, are also reported to telemetry (file type, size, reason and, for a damaged file, the error's class name; never the file name or content).

## Failure messages

- The server maps an AI failure to one cause (`classifyAiFailure`) and returns that cause's text. Texts never name the AI provider. The same texts are used for read and retry.
- **Busy** (AI call that failed with a retryable error): "The AI is busy or could not be reached. Please try again in a few minutes."
- **Timeout** (timeout or abort error): says the AI took too long and to split the document into smaller files.
- **Output cap** (reply stopped for length): says the document has more than the AI can write in one go; split it and import one at a time.
- **Refusal** (AI refused, or stopped by a content filter): says it declined and that trying again will not help.
- **Wrong shape** (no valid structured object came back): says the answer could not be understood and trying once more may help.
- **Key/config** (missing API key, bad provider setting, or a 401/403/404 from the provider): "The AI service is not set up correctly. Please tell the site owner."
- **Unknown** (anything else, including other unfinished-reply reasons and non-API network errors): says something went wrong, to try again and, if it keeps failing, contact the developer.
- When the SDK gave up after retries, the last attempt's error decides the cause.
- In the browser, a thrown read or retry call shows the Busy text. A retry that was thrown clears the "Retrying…" state, so Import unlocks.
- Non-AI rejections keep their own wording: unauthorised, no text, too long (over 200,000 characters), pictures unreadable.
- A failed retry closes the dialog and shows the message on that question's card. The draft is unchanged.

## Undo and Redo

- Every change to the drafts is an entry in a history: saved edit, delete, picture removed, picture added, picture moved, and a Retry-with-AI result. The list on screen is the read's drafts with the history applied.
- Undo and Redo buttons sit above the list. Their labels name the change, for example "Undo delete of Question 7", "Redo AI retry of Question 2", "Undo move of picture 1 from Question 1 to Question 3". With nothing to act on they read just "Undo" / "Redo" and are disabled.
- A new change empties Redo, including a Retry-with-AI result.
- Undo restores a deleted draft in its old position with its edits, hand-edit mark, pictures and per-question errors. Undoing a retry restores the draft's text as before the retry; its pictures are the same either way.
- Not in the history: the Add/Replace choice, and which cards have an open edit form. A new read starts a fresh history.
- Undo and Redo are disabled while a read or import runs, and allowed while a retry runs and while an edit form is open (Save then records a new change on top).
- Keyboard: Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes. There is no Ctrl+Y.
- The shortcuts are ignored while typing in a text input (text, search, email, url, tel, password, number), a textarea, a select or a contenteditable, so typing keeps the browser's own undo. The file input, radios and checkboxes do not block them.
- The shortcuts are also ignored while any dialog, alert dialog or menu is open, with Alt held, with a held (repeating) key, and while busy.
- Saving an edit form with nothing changed records nothing: no history entry, Redo kept, draft not marked hand-edited.
- Redo of a delete while that draft's edit form is open deletes it and drops the unsaved typing.

## Deleting a draft

- Each card has a Delete button (labelled "Delete question N"). It deletes at once with no confirmation; Undo brings it back.
- After a delete, focus moves to the Undo button. After undoing a delete, focus moves to the restored card.
- Deleting every draft keeps the review screen with the heading "All questions deleted. Undo to bring them back.", Undo enabled and Import disabled. Deleting does not reset the Teacher/Student view.

## Editing a draft

- Edit opens a form with Title, Content, and either Model answer (free-text) or Options (multiple choice), plus Explanation. The type cannot be changed here; a wrong type is fixed with Retry with AI.
- Options: each row has a correct-answer control, a text box and Remove. "Add option" adds a blank, unmarked row. Remove is disabled when 2 or fewer rows remain; after a Remove, focus goes to "Add option".
- A multiple-choice draft with no options opens with no rows and "Add option". Saved untouched, it stays without options.
- Single-answer questions use radios, and clicking any choice always makes it the only correct one (also when the choices were all marked). Multi-answer questions use checkboxes.
- Removing the only correct option is allowed; the card then shows a warning.
- Save trims blank optional fields: a Model answer or Explanation that is empty or only spaces is saved as nothing.
- While any edit form is open, Import is disabled and shows "Save or cancel your open edits first".

## What a card shows

- Number, title, a type badge (Free response, Multiple choice (one answer), Multiple choice (multiple answers)), Retry with AI, Edit, Delete.
- Content is rendered as formatted text (lists, bold, line breaks) like Student view.
- Long unbroken text (an email or URL) wraps inside the card: the title, content, model answer, explanation and option texts use `wrap-anywhere` (`overflow-wrap: anywhere`), the title row has `min-w-0`, and the action buttons group is `shrink-0`, so the page does not scroll sideways and Edit and Delete stay in view. The shared Student view card (`StudentQuestionCard`, also on the real student test page) wraps its title and content the same way, via `wrap-anywhere` on its title and on `MarkdownContent`. `e2e/import-ai-long-text.test.ts` checks the teacher card in a browser.
- "Retry with AI" uses the `secondary` button variant and a picture's "Remove" the `destructive` variant; Edit and Delete stay `outline`.
- Multiple-choice options show a tick for correct and a circle otherwise.
- Free-text cards show the Model answer under a "Model answer" label. A multiple-choice model answer is not shown (the import drops it). Every type shows "Explanation" when it has text. Both are muted and formatted; the label is hidden when the text is blank.
- A red badge appears on a multiple-choice card: "Needs at least 2 choices" when it has fewer than 2 options (this wins), else "No correct answer marked" when no option is marked. These are warnings only; the question can still be imported.
- Student view shows the same drafts as students would see them, with no answer key (no correct marks, model answer or explanation).

## One question number everywhere

- A card's number is the number the question will have in the test: in Add mode it continues after the test's highest existing question number; in Replace mode it starts at 1. Switching the mode renumbers live.
- The same number appears on cards, Student view, the Unused-pictures dropdown, the Move menu, the Undo/Redo labels and a rejection message.
- A rejected question reads "Question N — reason" on its card (and "Question N: title — reason" under the Import button when Student view hides the card). The server's own message, which numbers by position in the list, is not shown for a rejection.

## Pictures

- Each card shows its pictures with Remove and "Move to question…". Move lists every other question as "#N title". A question that already holds that picture is disabled with "— already has this picture"; one with 3 pictures is disabled with "— full". The trigger is disabled when no question can take it.
- Under each picture the card shows "Picture k", k being its place among that question's pictures (document order). It is the name students see, so it can change when a picture is moved, removed or added.
- A title, content or option whose text is only picture markers (such as a picture choice `[image 4]`) names pictures by place: the card and Student view show it as "Picture k" (several: "Pictures k, m", in marker order), k being the picture's place among the question's current pictures. Import saves that same text. The edit field keeps the raw marker and says under it "Shows as Picture k".
- If such a text names a picture the question no longer holds (moved, removed, or typed by hand), it shows the raw marker, the card warns "Option 2 names a picture this question no longer has. Move the picture back or edit the option to import it." (or "The title" / "The content"), and the edit field says "Names a picture this question does not have". Clicking Import refuses that card ("Question N — Option 2 names a picture this question no longer has") before any picture is uploaded. Undoing the move clears the warning.
- Markers in text never attach a picture: only the document read does. Text with words around a marker is plain text when typed by hand (the read already removed such markers).
- Move is one history entry; Undo moves the picture back.
- Pictures that no card uses sit in "Unused pictures", where a dropdown plus Add attaches one. Add is disabled when the chosen question already has 3 pictures.
- A retry result never changes a question's pictures: it replaces the text fields and keeps the pictures the teacher sees. A question showing more than 3 pictures shows a note; Import is not disabled, but clicking it refuses that question on its card ("Question N — Its pictures could not be uploaded: A question can have at most 3 media files") before any picture is uploaded, until one is removed.

## Leaving the page

- Refreshing or closing the tab with work on screen shows the browser's own warning. Browser Back is not guarded.
- Sidebar links (including the platform owner's Schools link), the logo link, the breadcrumb links on this page (`@breadcrumb/.../import-ai/page.tsx`) and Sign Out go through a "Leave this page?" dialog with Stay and Leave when work is on screen. Without work they act at once.
- The sidebar's school switcher is not guarded: switching school with work on screen discards it without asking.
- The admin layout's guard is shared by every admin page: a page registers its work with `setHasWork(hasWork, message?)`, and without a message the dialog reads "You have unsaved changes on this page. Leaving now discards them."
- The import page passes its own text per phase. Idle: questions have not been imported and leaving discards them. Reading: adds that a document still being read is not stopped and its result is thrown away. Importing: says the import keeps running and finishes in the background.
- The guard resets when the page unmounts, so admin links stop asking after Leave.
- If the teacher leaves during an import, the import finishes and the page does not redirect to the test page.

## Importing

- The Import button reads "Import questions" (Add) or "Replace questions" (Replace) and "Importing…" while writing. It is disabled while busy, while a retry runs, while an edit form is open, when there are no drafts, and in Add mode after an import call that never answered (see below).
- The server rejects an empty list, and validates the whole list before writing anything. It then checks that the test belongs to the teacher's current school (`resolveOwnedTest`) and writes every question through that school's question service. For title, content and each option text, spaces-only counts as empty; reasons are "title is empty", "content is empty", "option K is empty". The text is imported as typed.
- A single-answer question may have no correct option or one, never two or more; a multi-answer question may have none or any number (the warnings above tell the teacher). The number of options is not checked at the AI-import door. Pictures are checked as in the manual add form, in the same pass before anything is written or deleted: every key must be one the teacher's current school minted (`media/schools/<schoolId>/questions/<uuid>.<ext>`) with the extension of its declared type (else "Invalid media key"), and only pictures are taken ("Only pictures can be imported" for a video). Only the known picture fields are stored.
- A rejected question gets its message on its own card; a rejection with no question (for example unauthorised) shows as a banner under the button. The card message stays until the next Import click, a new read, or a Retry-with-AI result for that question.
- On Import, pictures upload up to 4 questions at a time, in review order. A picture upload failure starts no further uploads and lands on the earliest failing question in review order; nothing is imported.
- Each picture uploads at most once per read: a later Import click uploads only pictures not uploaded yet, and a picture two questions share is uploaded once and saved with both. A new read (or a finished import) starts over. Uploaded pictures of an import that never completes stay in storage unused.
- An import call that throws (dropped connection, server crash) returns the screen to the list and keeps every draft. The server may have written part or all of the import.
- In Replace mode the banner reads "The import didn't finish because the connection to the server failed. Open the test page to check its questions before trying again." Import stays enabled: a repeat deletes before it writes, so it cannot duplicate.
- In Add mode the banner reads "The import didn't finish because the connection to the server failed, so the questions may have been added anyway. Import stays off until you check the test page." Under it: an "Open the test page" link (new tab, so the list survives) and a button "I checked the test page — nothing was added", which clears the banner and turns Import back on. Until then Add stays disabled for this read, through edits, Undo and Redo; switching to Replace is allowed (it never duplicates) but never suggested. A new read clears the lock.
- On success the teacher goes to the test's page.

## Replace confirmation

- In Replace mode, Import opens "Replace this test's questions?". The teacher must type "override" (case and surrounding spaces ignored) before "Yes, replace" enables.
- First sentence: "This deletes the test's N question(s) and adds the M reviewed question(s)." When the test has no questions it reads "This adds the M reviewed question(s)."
- Only when at least one student has answered: "At least K students already answered: their answers to the old questions won't count, their scores show 0% until the new questions are graded, and some may show as In Progress again. To keep existing scores, create a new test instead." K is the highest per-question answered count, a lower bound.
- The counts come from the page load, so they can be stale if the test changes elsewhere.
- Replace deletes the existing questions first and then adds the new ones; with no transactions, an infrastructure failure partway can leave a mix, and the error says so.

## Key decisions

- New file over a list always asks first (even an untouched list): a read costs money and about a minute.
- Delete is immediate with full undo/redo history, instead of a confirm per delete or a single latest-delete Undo.
- Retry with AI keeps the question's pictures: the teacher places pictures by hand (one undoable click), so a paid AI call must not undo that. Undo reverses the whole retry.
- Import is blocked while edit forms are open, rather than importing the last saved version.
- Failure texts by cause, no provider name, so the teacher knows whether retrying can help.
- Orphan-retry cancellation was not built: the retry dialog is modal, and closing it already cancels the retry.
- Leaving during an import is allowed with honest wording instead of blocking.

## Known limits

- The retry dialog is modal, so several retry-versus-delete/redo/new-read races cannot happen through the screen. Two reducer guards behind that (a late retry result for a missing draft; Undo while busy) are defensive and not reachable from the UI.
- Eight visual states could not be captured in the visual QA, because the in-process AI mock returns one free-text question per read: the choices editor, both answer-key badges, the open Move menu, the 30-question list, the picture-limit state, Replace with answered students, the retry dialog and a retry failure. They are covered by automated tests only.
- A plain network error (not wrapped by the AI SDK) is classed Unknown, not Busy.
- An Explanation over 4,000 characters is rejected with the schema's generic message, which does not name the field.
- A rejection stays on its card after the teacher fixes the question, until the next Import click.
- Only this page's breadcrumb uses the guard; other admin pages' breadcrumbs are plain links, which is fine because they never hold work.
