# Revamp stage 2: grading screen and grading actions

Living spec for stage 2 of the LMS revamp. It describes the code on branch `feat/revamp-stage-2` at `c8c8c608` (51 behavior commits on base `54c77f85`, not pushed, no PR yet).

- "Teacher" in the UI is the admin role in code. "Hand-in" is a student's submission of a test; "waiting" means handed in with at least one answer that needs a grade.
- The grading screen has two routes that render the same screen: `/admin/grading/<testId>` (opened from To grade, called the hub route) and `/admin/courses/<courseId>/tests/<testId>/grading` (opened from the test page, called the course route). Every behavior below holds on both.
- Two views: **By student** (one student, one question at a time) and **By question** (one question, one student at a time). The URL holds the selection: `mode=question`, `studentId`, `questionId`, `needsOnly=1`, `done=1`.
- Stage 2 changes the grading screen, the grading server actions, the release flow (also from To grade and the course Tests tab), redo, practice-test grading, photo marks, marking choice answers that never got their automatic mark, and one student-side rule (answers lock after hand-in). The student result page changes only to show text marks.
- The decisions behind each rule are listed at the end under [Decisions](#decisions), by behavior number.

## Status

- All 51 behaviors done, one commit each (see [Commits](#commits)). The fixes from the code review were folded into the behavior commits.
- Final checks are under [Verification](#verification); open items under [Open items](#open-items).

## Behaviors

### Top bar and empty states

**1. Top bar.** The top bar holds a back link to the test page (titled with the test name), a By student | By question switch, the position control, the "x of N fully graded" bar and Release ▾.
- By student: the position control is the student picker naming the student shown (name and @username) with ‹ k of N submitted ›.
- "x of N fully graded" counts fully graded students over students who handed in, read from the school grading counts. Both views show the same numbers.
- The switch keeps the student on screen and the question when changing view. In By question the student kept is the one on screen, not the one in the URL.
- A visually hidden h1 "Grade: <test>" stays under the bar for screen readers.
- Both grading routes open with the sidebar folded to the icon rail, and both highlight "To grade" in the sidebar.

**2. Empty states.** With no students enrolled: "No students enrolled in this course yet." With students but no hand-in: "Nobody has submitted yet." (a By student link that names one student shows it above her answers). A test with no questions: "This test has no questions yet."

### Left pane

**3. One question as the student saw it.** The left pane shows the question card (text and pictures) and the student's answer.
- Written answer: monospace text under "Student Answer · n lines" (a trailing newline does not add a line).
- Choice answer: the options with the student's picks coloured right or wrong, without marking missed correct options.
- Blank answer: nothing in the pane; the grade panel says so.
- A written question with a non-empty model answer gets a folded "Model answer · students see it once correct answers are shown", or "Model answer · students can see it" once correct answers are released or shown on submit.

**4. Compare with AI fix.** Under a written answer whose latest AI suggestion has a fix, "Compare with AI fix" opens a side-by-side diff: "<name>'s answer" against "AI suggested fix · not shown to <name> until you use it", with "n lines differs" above it.
- It stays available on a stale suggestion; the stale flag on the AI card is the warning.
- Below 900 px the diff is one column, titled "− <name>'s answer · + AI suggested fix", and the privacy note moves next to the line count.
- Hidden on practice tests.

### Grade panel

**5. Grade panel and saving a score.** The panel header reads "Grade · Q<n> · <name>" with "<question title> · @<username>" under it, so a score cannot land on the wrong answer.
- Written or photo answer with content: Score (0–100, whole numbers, required) with quick 0 / 50 / 100 buttons, Feedback, and "Correct Solution (optional)".
- Choice answer: a read-only score line (the system marks choice answers), or the Mark button when its mark never ran (Behavior 51). Blank answer: a note, and any legacy score.
- A written or photo answer counts as having content when its text is not only spaces, or it has at least one photo.
- Saving an empty solution clears the saved one; a solution field that is not sent keeps it.
- The only save button is Save & next (Behavior 17); choice and blank answers have none, so the teacher moves on with the boxes or ‹ ›.

**6. Overall feedback.** Once the student has saved at least one answer, a folded "Overall feedback for <name>" row at the bottom of the panel writes, changes or clears the student's overall test feedback ("Save Feedback" / "Update Feedback"). Saving it empty deletes it and says "Feedback cleared"; otherwise it says "Feedback saved". The form is keyed by student, so a draft never saves onto another student.

**7. Panes scroll on their own.** The answer pane and the grade panel each scroll; the Save & next button and its line sit outside the panel's scroll area, so they stay in view.

**8. Unsaved grade warning.** Leaving an answer with a typed score, feedback, solution, overall feedback or unsaved photo marks that differ from what is saved asks "Discard your unsaved grade?" first. This covers question boxes, student boxes, the picker, ‹ ›, the view switch, the back link, finish-panel links and the sidebar.
- Save & next with an unsaved overall-feedback draft asks the same question: Stay saves nothing; Leave saves the grade and moves on, dropping the overall draft.
- Closing or reloading the browser tab does not warn.

### Question row and filter (By student)

**9. Question number row.** One box per question for the student shown, wrapping onto more lines on long tests. The current box has a ring; a click opens that question.
- Box states: correct, partly right, wrong (choice answers, from the system's mark), graded (written or photo, with a check), needs grading (amber), blank, and plain (unanswered before hand-in, or a choice answer before hand-in; a written answer saved before hand-in reads needs grading). A handed-in choice answer with a selection and no grade reads needs grading (Behavior 51), except while the student has an open redo, when it reads plain until she hands in again. Each box's name says its state in words (a plain box shows only its number), so colour is not the only cue.
- A legend counts every state over all questions: "Correct n · Wrong n · Partly right n · Graded by you n · Needs grade n · Blank n".
- While a redo is open the row follows the redo rule: changed answers do not read "needs grading" until the student hands in again.

**10. Needs grading only.** The "Needs grading only" toggle keeps the boxes that need a grade plus the current box; the legend still counts all questions. With nothing left it says "Nothing needs grading". The filter lives in the URL, so it stays on across boxes, students, ‹ ›, the view switch and Save & next. Not shown on practice tests.

### AI suggestions

**11. AI suggestion card.** For a written answer with suggestions, the card shows the latest suggestion's score ("n / 100"), full feedback, model and time, with a "Stale" badge when it was made against an older answer.
- The AI job notes (grading in progress, with auto-refresh, or failed) sit under the panel header.
- "View history (n)" lists older suggestions newest first (creation time, then id). Each older row has its own Use, and "Show suggested fix" when it has a fix.
- "Suggested fix: n lines changed · shown on the left" appears on the latest row only when the fix and the student's text both exist.

**12. Use.** "Use · saves score, feedback & solution" writes the suggestion as the grade at once and the row reads "Used".
- A suggestion with no fix clears the saved solution, so the grade equals the suggestion.
- "Used" shows only while the saved score, feedback and solution all equal the suggestion; any hand edit drops it and the card offers Use again.
- Use on a stale suggestion asks nothing extra. Use replaces an unsaved draft in the form without asking.
- A refused Use shows its message under the button; a successful one shows only the badge.

**13. Replace your grade?** When the saved grade is the teacher's own (a grade exists and no suggestion on that question reads "Used"), Use first asks "Replace your grade?" ("This answer already has a grade you wrote. Using this suggestion replaces its score, feedback and solution."). The server refuses a Use over the teacher's own grade unless the request says the replace was confirmed.

**14. Regenerate one answer.** "Regenerate this answer" opens a dialog that shows the current suggestion and asks for a reason (required, 3–500 characters, with a counter). The new suggestion arrives as a "New AI suggestion" preview with "Use this", "Reason: …" and "Previous suggestion: n — …"; the grade does not change until the teacher uses it. Older regenerated rows in history keep "Use" and "Regen reason". Locked while an AI job runs.

**15. Auto-grade with AI.** More ▾ offers "Auto-grade with AI" for a handed-in student who is waiting and has no suggestions yet. Disabled while an AI job runs.

**16. Regenerate all with AI.** More ▾ offers "Regenerate all with AI…" for a waiting student who already has suggestions. The dialog takes a reason (3–500 characters) and "Also regenerate questions I've already graded".
- Off: "only answers still waiting for a grade get a new suggestion, including answers changed since your grade."
- On: every written answer gets a new suggestion.
- With nothing to regenerate it says "Every question already has your grade. Tick the box to regenerate them anyway." or "This student has no written answers to regenerate." Disabled while an AI job runs.

### Save & next

**17. Save & next.** The pinned button saves the grade (and the photo marks) and opens the next answer that needs a grade; the server finds it and builds the link (see [Save & next order](#save--next-order)). It stays on the route it was pressed on (hub or course) and keeps "Needs grading only". The button is locked while saving.
- Labels in By student: "Save & next: Q<n> ›" with "k written answers left for <name>" ("k answers left for <name>" when an unmarked choice answer is among them); "Save & next student" with "<name>'s last answer to grade · m more students waiting"; else "Save & next" with "Nothing else in this test needs a grade".
- The label uses the same search the action runs, so they cannot point at different answers.
- The grade records when the answer on the teacher's screen was saved, so an answer the student changes after the screen loaded still needs a grade after the save.
- A save that fails stays on the answer: the reason shows next to the button (for example "Unauthorized: admin access required" or "Student not found") and the typed score, feedback and solution stay in the form. Only a successful save moves on.
- When the AI had suggested a grade for the answer, the save records how far the teacher's grade is from it (telemetry).

### Student picker

**18. Grouped picker.** The picker is a dropdown grouped Needs grading / Graded / Still writing / Redo requested / Not started, each with a count; a group with no matching student is not shown.
- Needs grading lists the oldest hand-in first ("oldest submission first", each row "n left"); every other group sorts by name, then id.
- Still writing rows read "k of m saved" or "nothing saved yet"; a student with nothing saved and Not started students are listed but not clickable. The Still writing header adds "asks first".
- Every row and the trigger show the @username, so two students with the same name can be told apart.
- A bare open shows the oldest waiting student, else the first graded one, else "Nobody has submitted yet.". By student opens that student's first answer that needs a grade or, once she has handed in, her first unmarked choice answer (Behavior 51).

**19. Picker search.** "Search name or @username" matches name or username, ignoring case, accents and Vietnamese đ; a leading @ is ignored. No match shows "No student matches".

**20. Next waiting student.** "Next waiting student" (hint "skips graded") opens the oldest waiting student other than the one shown; disabled when there is none, hidden while a search is typed.

**21. ‹ › stepping.** ‹ › walk the Needs grading then Graded students in picker order. Still-writing, redo-locked and not-started students are skipped; while one of them is shown the counter reads "– of N submitted", › opens the first submitted student and ‹ the last.

**22. Still writing, from the picker or a box.** Opening a still-writing student asks "<name> is still writing. Grade anyway?" ("<name> hasn't submitted <test>. You'll see the k of m answers saved so far."). After "Grade anyway" her saved answers can be graded. Both lines use her full name. Cancel stays on the answer shown before. The choice lasts for the page visit: after "Grade anyway", the picker and her By question box open her without asking again.

**23. Still writing, by direct link.** A link straight to a still-writing student shows her answers with grading locked under "<name> hasn't submitted <test>. Grading is locked until you choose Grade anyway." and a "Grade anyway" button that unlocks at once. The lock covers the score, feedback and solution fields, quick scores, overall feedback, Use, Replace, Regenerate and Save & next; View history, Show suggested fix and Compare with AI fix stay usable. Once unlocked, saving asks nothing more.

### By question

**24. By question top bar.** The position control is a question picker with ‹ › over the questions in order. "x of N fully graded" counts the whole test, as in By student. A bare By question open lands on the first question where a waiting student has an answer to grade or an unmarked choice answer, else the first written or photo question, else Q1 (practice: Q1).

**25. Student row.** One box per student who has started, with initials (the first letters of the first and last word of the name), in picker order. Boxes use the same colours as the question row; still-writing students are blue (not clickable when nothing is saved, and asking first otherwise), redo-locked students are grey disabled buttons. Not-started students have no box and are counted as "n not started".
- Legend on a written or photo question: "Graded by you n · Needs grade n · Still writing n · Redo requested n · Blank n".
- Legend on a choice question: "Correct n · Partly right (light blue) n · Wrong n · Still writing (dark blue) n · Redo requested n · Blank n". An unmarked choice answer's box reads needs grading, which this legend does not count (see [Open items](#open-items)).
- "Needs grading only" works here too: the boxes that need a grade plus the one on screen.
- The open student is the one in the URL (unless redo-locked), else the first box that needs a grade, else the first box that is not redo-locked (when nobody has handed in, this can be a still-writing student with nothing saved).

**26. Same grade panel in By question.** The chosen student's answer gets the same left pane, grade panel, AI card, Regenerate, More ▾, unsaved warning, still-writing lock and Save & next, with the same fill-the-screen layout.
- Labels: "Save & next: <student>" with "n answers left on Q<k>" while another student waits on this question; "Save & next: Q<k>" with "Last Q<j> answer to grade" when it moves to another question; else "Save & next" with "Nothing else in this test needs a grade".

### Release

**27. Release state chip.** Release ▾ shows the test's state: "Shown on submit", "Released" (whole test), "Released to x of N" (some graded students released one by one, even when x equals N) or "Not released". The rule is shared with the course Tests tab's "Students see" column; the Tests tab shows "Nothing yet" when nobody has submitted, the top bar does not.
- When nothing is left to release (grades and correct answers both out or shown on submit), the chip shows alone with no menu.
- After a whole-test release, while the menu still has an entry, it says "Grades released for the whole test" with "Students graded later see theirs right away." under it.

**28. Release correct answers on its own.** While correct answers are hidden, the menu offers "Release correct answers" as its own entry, also after grades are out or on a "Shown on submit" test.

**29. Whole-test release.** "Release grades…" opens the release dialog ("Release grades · <test>", with "n graded · n waiting · n still writing · [n redo requested ·] n not started"). "Whole test" releases grades for every student, including students graded later, in one click; "Also show correct answers" (unticked by default, hidden when they are already visible) releases them in the same write. Releasing with nobody graded is allowed.

**30. Release from To grade and the Tests tab.** The Release button on To grade's "Graded, not released" rows and on the course Tests tab opens the same dialog in place. The dialog loads that test's students when it opens (showing "Loading students…", or "Could not load this test's students. Close this and try again."), listed in the grading screen's picker order, so the dialog reads the same from every entry. A roster answer from an earlier or closed opening is ignored.

**31. Chosen students, all or nothing.** "Only chosen students" releases every ticked student's grade in one write, or none. The server refuses the whole request when any ticked student is not Graded or has an open redo: "Nothing was released. Not graded: <names>; Open redo: <names>". A student outside the course gets "Student not found". With the correct-answers tick on, correct answers open for the whole test after the grades write.

**32. Chosen-students checklist.** The checklist lists "Graded · n" (already-released students ticked and disabled, "Released") and "Not graded yet" (disabled, with "Waiting for grading", "Still writing", "Redo requested" or "Not started"), with search over name and @username, "Select all graded (n)" (ticks every graded student not yet released, not only the filtered ones; n counts them and the button is disabled when there are none) and "n selected". Release reads "Release to n students" and is disabled with nobody ticked.

### Finish panel

**33. Grading done.** After the Save & next that leaves nothing to grade, the finish panel stands where the grade panel was: "Grading done · <test>", "<name>'s Q<n> saved <when>", "All n submitted students graded" with the first three graded students (Released or Graded) then "and n more", a line on who can see their grade, and who is still writing or has not started ("New submissions show up in To grade."). The answer pane shows "Your grade: <score> · saved <when>". A "Back to test" link returns to the test page. The panel shows only while nothing waits, so a stale `done=1` link falls back to the grade panel; opening a fully graded test without Save & next does not show it. Never on practice.

**34. Finish panel release button.** Pinned at the bottom: "Release…" (opens the release dialog) while any graded student cannot see her grade, else "Release correct answers" while those are hidden, else nothing.

**35. Next in To grade.** "Next in To grade" opens the grading screen of the next test with waiting work, on the same route kind. With none, the link opens the To grade list and the panel says under it "Nothing else waiting", or "Nothing else waiting · Review <test or n tests> not released".

### Redo

**36. Redo hand-in.** After a redo, grades stay. Only the answers the student changed after their grade need a grade, so she is back in To grade with just those. Choice answers are re-marked at the hand-in.

**37. Open redo is read-only and counts nowhere.** While a redo is open the student sits under "Redo requested" in the picker, her By question box is grey and disabled, and opening her By student view shows her answers with "<name>'s answers are read-only while the redo is open. Grading opens again when <name> hands in." and no grade panel, finish panel, More ▾ or Save & next. She is left out of To grade, the sidebar badge, "x of N fully graded" (both x and N), ‹ › and release.

**38. AI for changed answers.** Auto-grade with AI and Regenerate all (box unticked) also draft suggestions for answers changed after their grade; each changed answer joins the student's one AI request for that round.

**39. Answer changed after your grade.** A changed answer's panel shows "Answer changed after your grade" above the form, which pre-fills the old score, feedback and solution. Its box reads needs grading.

**40. Release to one student.** More ▾ offers "Release to <name>" ("Only <name> sees this grade now") for a Graded student while the test's grades are not out for everyone and she has no open redo. It posts one chosen-students release with her id, so the server applies the same refusals. Once released the item reads "Released to <name>", disabled.

**41. Request redo.** More ▾ offers "Request redo…" for a handed-in student (Submitted or Graded) with no open redo, never on practice. The dialog "Ask <name> to redo <test>?" shows her @username and hand-in time, what she sees ("Redo Required · Your teacher has requested that you redo this test."), and "Grades stay. Answers changed come back to To grade." The redo is requested only on "Request redo". For a handed-in student the old timed start is cleared first, so the redo gets a fresh clock.

**42. Answers lock after hand-in.** The student's answer save is refused after hand-in unless a redo is open: "This test is handed in. Ask your teacher for a redo to change answers." This holds on practice tests too, where a redo cannot be requested.

### Practice tests

**43. Practice shows answers only.** On a practice test the screen shows the students' answers with no grade panel, AI card, More ▾, Save & next, overall feedback, release or redo. The top bar shows the chip "Practice · no grades released" and no "fully graded" bar (the "k of N submitted" stepping stays).
- The picker puts every hand-in under one "Submitted" group, even one graded before the test became practice, and opens the first one by default; there is no "Next waiting student".
- Opening a still-writing student does not ask.
- Boxes read answered or blank (By question also still writing), with the legend "Answered n · Blank n" in By student and "Answered n · Still writing n · Blank n" in By question, and no "Needs grading only".
- Photos show as the student sent them, without mark tools or old marks. Compare with AI fix is hidden.
- Grades given before a test became practice stay visible to students; the screen does not show or edit them.

**44. Practice to normal.** Saving a test's settings from practice to normal marks the choice answers of every active hand-in from the answer key at that moment, and refreshes both grading routes and To grade. The marking runs before the test is saved as normal, so a marking failure leaves the test practice and saving the settings again retries it. Saving a normal test's settings again marks nothing. A choice answer that already has a grade keeps it, unless the student changed the answer after that grade. Written answers stay ungraded. Switching normal to practice changes nothing. Tests switched before this code shipped keep their unmarked choice answers.

### Photo marks

**45. Photo viewer.** A photo answer shows one photo at a time: the header "n photos · showing photo k" ("1 photo" for one), a strip group "Photos" with one thumbnail button per photo named "Photo k · n marks" ("1 mark", "0 marks"), and zoom toggles "Fit" (default) and "100%" (the photo scrolls on its own at 100%). Undo and "Clear photo" act on the shown photo only.

**46. Circle and arrow.** Tools: Pen, Circle, Arrow, Text and Move, with four colours (red, blue, green, near-black). Circle draws an ellipse in the dragged box; Arrow draws a shaft and two head lines. Move lets a finger pan the photo without marking; Pen is the default.

**47. Text marks.** With Text, a click opens a typing box at that spot. Enter or leaving the box keeps the text (trimmed, up to 200 characters; blank text is dropped); Escape cancels. Text near the right edge (past 60 % across) or bottom (past 80 % down) grows left or up so it stays inside the photo. One Undo takes back the latest mark of any kind; Clear photo removes strokes and texts together.

**48. Marks save with Save & next.** Photo marks are sent with the grade on Save & next; there is no separate save button. The server writes the grade first, then the marks, so a failed grade save stores no marks; a failed marks save leaves the grade saved and shows the reason with the marks still on screen to retry. Unsaved marks count as unsaved work for the discard warning. The marks are keyed by student, question and saved-grade time, so they never carry over to another answer. With a redo open or the finish panel showing, photos are read-only (saved marks show, all photos stacked, no tools or strip).

**49. Student sees text marks.** The student's result page shows the teacher's text marks along with the drawn marks.

### Narrow screens

**50. Tablet layout.** Below 900 px (phones included) the top bar breaks to a second row before the position control, and the grade panel sits under the answer pane as one section that folds to a bar (Score, Save & next, a "Feedback" button) and expands on tap ("Collapse" folds it). Folding hides the fields without unmounting them, so a typed draft survives. The AI job notes and "Answer changed after your grade" stay visible on a row above the folded bar. Dialogs are capped at the screen height minus 2 rem and scroll inside.

### Unmarked choice answers

**51. Mark multiple-choice answers.** An unmarked choice answer is a handed-in student's choice answer with a selection and no grade: its automatic mark never ran (for example, a hand-in made while the test was practice that the practice-to-normal marking missed). In place of the score line, its grade panel shows "Not marked yet · automatic marking did not run for this answer", a "Mark multiple-choice answers" button, and "Marks every unmarked multiple-choice answer in this test" under it.
- One press sends one action that marks the unmarked choice answers of every hand-in of the test from the answer key, keeping existing grades except on answers changed after their grade. The button is disabled while it runs; afterwards both grading routes and To grade refresh, and the panel shows the real score and the box its result.
- A failure shows "Marking did not finish. You can try again." under the line and keeps the button; the marking is safe to run again, so a retry finishes the rest. An expired session gets "Unauthorized: admin access required".
- The number-row box and the By question box read needs grading. Save & next, "Next waiting student" and a bare open stop at such an answer, so the teacher reaches the button even when it is the only waiting work. A still-writing student's choice answer is never a stop: it has no mark only because she has not handed in.
- The student keeps counting as waiting (Needs grading in the picker, To grade, the sidebar badge) until her choice answers are marked.
- Works on both routes and in the narrow layout. Never on practice, where the grade panel is not shown.

## Rules

### Needs a grade

Two layers decide whether an answer waits for the teacher.
- **Time rule** (`needsGrade` in `src/lib/needs-grade.ts`): no answer never needs a grade; an answer with no grade needs one; an answer saved after the answer its grade describes needs one, unless a redo is open, in which case it waits for the hand-in. The status service, the school counts (and so the picker groups) and the choice marking's keep-existing check call it.
- **Screen rule** (`answerNeedsGrade` in `src/lib/next-answer-to-grade.ts`): the time rule, applied only to an answer the teacher can grade (`isGradableAnswer`: a written answer whose text is not only spaces, or a photo answer with at least one photo, on a non-choice question). The number row, the By question boxes, the default question, the "Answer changed after your grade" note, the Save & next search and its "was waiting" check, and the AI candidate filter call it.
- **Unmarked choice answers** (`isUnmarkedChoiceAnswer`, same file): a choice answer with a selection and no grade. The number row, the grade panel, the default question and the Save & next search treat it as waiting once the student has handed in (Behavior 51).
- **Which answer a grade describes**: a grade stores `gradedAnswerAt`, the save time of the answer it graded. Save & next sends the save time of the answer on the teacher's screen, the hand-in marking stores the marked answer's, and Use stores the save time of the answer the AI read (`gradedAgainstAnswerId`). A grade without it (older grades, or a re-grade sent without one, which drops a stored one) falls back to `updatedAt`, else `gradedAt`.
- Choice answers are marked by the system at hand-in; blanks score 0 and need nothing.

### Counts

The school grading counts (`grading-count-service.ts`) feed To grade, the sidebar badge, the top bar's "x of N fully graded", the picker groups and the release roster.
- A pair's answers-left uses the time rule with each answer's latest save time and each grade's times. Any saved answer counts as answered, so an unmarked choice answer keeps the student waiting until it is marked: visible rather than released without its mark.
- The page render reads the whole school's counts. Save & next reads counts for its own test and course only.
- A student with an open redo counts as In progress: out of submitted, fully graded, waiting, answers left, ready to release and released-to. Her pair keeps `redoRequested: true`.
- An expired timed attempt counts as handed in, also over an open redo. The grading screen hands in the flagged expired attempts before reading answers and grades, so their choice answers are already marked.
- The screen reads once per render: school counts, then hand-ins for expired attempts, then the test's answers and grades (`grading-screen-read.ts`).

### Save & next order

The server runs `findNextAnswerToGrade` after the write and redirects to the link it builds from the posted route kind (hub or course); no return path comes from the browser.
- An answer is a stop when it needs a grade by the screen rule, or is an unmarked choice answer of a handed-in student.
- By student: the same student's later stops, then her earlier ones, then the first stop of the oldest waiting student.
- By question: the next waiting box on this question in box order (wrapping), then the first waiting box of the next question (wrapping). The student on screen keeps her place among the waiting boxes when she was waiting before this save: she is Submitted, or Graded with the answer just graded still waiting against its previous grade (a re-grade of a changed answer).
- Still-writing and redo-locked students are never picked as next.
- Nothing left: the same answer opens with `done=1`, which shows the finish panel.
- Failures: a failed session check, form parse, target check, write or read after the write returns its reason instead of redirecting (Behavior 17).

### Release

- Whole test: sets the grade release time, and the correct-answers time when ticked, only when unset and not already covered by "show on submit", so a second click does not move the recorded date.
- Chosen students: each id is checked (enrolled, Graded now, no open redo) before one `updateMany` stamps every active hand-in; any failure releases nothing.
- A per-student release must be given again after a redo hand-in; a whole-test release and "show on submit" keep applying.
- "Release correct answers" is test-wide in every mode.

### Redo

- Grades are kept across a redo; only answers changed after their grade come back (see [Needs a grade](#needs-a-grade)).
- While open, the student is locked (Behavior 37) and her changed answers do not count until she hands in.
- A student cannot change answers after hand-in without an open redo (Behavior 42).

### Practice

- The screen shows no grading on practice; the server actions add no practice check beyond the existing refusal to request a redo on a practice test. The Mark multiple-choice answers action does not refuse a practice test either; the button never shows there.
- Going practice to normal marks choice answers (Behavior 44); going normal to practice changes nothing.

### Photo marks and scaling

- Strokes, circles and arrows are stored as ordinary point strokes in normalized (0..1) photo coordinates, so the student overlay draws them with no special case. Text marks are a separate optional `texts` list per photo, drawn as an HTML layer.
- Each stroke and text carries an optional `seq`, its place in the photo's mark history, so Undo follows the order marks were made across save and reopen. Marks without `seq` open as strokes first, then texts.
- Colours come from one palette (`ANNOTATION_PALETTE`); the server checks text colours against it and text length up to 200.
- Marks keep their spot and size relative to the photo at every display size (Fit, 100 %, the narrow layout, any photo resolution, the student result page): stroke width is 0.3 % of the photo width and text 3 % (container query units); an arrow head is 30 % of the arrow's length, clamped between 1.5 % and 4.2 % of the photo width, measured in pixels at draw time so it keeps its angle on a non-square photo.
- The typing box uses at least 16 px text so iOS does not zoom; the kept mark uses the 3 % size.
- The overlay's mark layer (and the drawing surface's SVG) has size containment, so a square viewBox does not stretch the photo's cell.
- Stored marks from before this stage are shown as they are, with no conversion.

## Access

- Every grading action checks the admin session and that the test, course and student belong to the session's school (`assertGradingTarget`, `resolveOwnedTest`). The Mark multiple-choice answers action checks the session and the test (`resolveOwnedTest`); another school's test gets the fixed failure wording and nothing is marked.
- `GET /api/admin/tests/<testId>/release-roster` needs a school-admin session (401 without), answers 404 for a missing or other school's test, is read-only (it never hands in an expired attempt) and sends `Cache-Control: no-store`. The proxy does not cover `/api/admin/*`, so the route's own session check is its only gate. Students are listed in the grading screen's picker order (`buildStudentPickerRows`).
- The student answer-lock check sits in the student's save action, the only production writer of answers.

## Data rules

- No migration. New fields are optional: `texts` and `seq` on annotation entries, and `gradedAnswerAt` on grades. Grades without `gradedAnswerAt` fall back to `updatedAt`, else `gradedAt`.
- An empty solution on a grade update clears the solution; an empty overall feedback deletes the feedback row.
- Applying a suggestion with no fix writes an empty solution.
- The practice-to-normal switch and the Mark multiple-choice answers action write choice grades for existing hand-ins of that test only.

## Key files

- Screen: `src/app/admin/(dashboard)/grading/page-body/` (`grading-page-shell.tsx`, `grading-page-shell.ui.tsx` (`GradingScreenLayout`), `grading-page-body.type.ts` (`GradingRouteKind`, `ReleaseMode`), `grading-top-bar.ui.tsx`, `grading-detail-student.tsx`, `grading-detail-question.tsx`, `answer-pane.tsx`, `compare-with-ai-fix.tsx`, `grade-panel.tsx`, `grade-panel.ui.tsx`, `unmarked-choice-answer.ui.tsx`, `question-row*.ts(x)`, `student-picker*.ts(x)`, `still-writing-confirm.tsx`, `unsaved-grade.state.tsx`, `more-menu.tsx`, `request-redo-dialog.tsx`, `release-*.ts(x)`, `finish-*.tsx`, `annotation-*.ts(x)`, `href.ts` (`gradingHref`, `gradingBasePath`), `revalidate-grading-paths.ts`).
- Routes: `src/app/admin/(dashboard)/grading/[testId]/page.tsx`, `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/page.tsx`. Each passes its route kind to the shell, which builds every grading link from it.
- Actions and forms: `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/` (`actions.ts`: `saveAndNextAction`, `releaseTestAction`, `requestRedoAction`, `setTestFeedbackAction`, `releaseCorrectAnswersAction`; `mark-choice-answers-action.ts`: `markChoiceAnswersAction`; `ai-grade-actions.ts`; `grading-forms.tsx`; `ai-suggestion-panel.tsx`; regenerate dialogs). Settings switch: `../settings-actions.ts`. Every grading write, the settings switch and the marking action refresh both grading routes and To grade through `revalidateGradingPaths`, which also takes the extra pages a write changes.
- Roster route: `src/app/api/admin/tests/[testId]/release-roster/route.ts`. List release button: `page-body/release-from-list.tsx`, used by To grade and `courses/[courseId]/(tabs)/tests-table.ui.tsx`.
- Rules: `src/lib/needs-grade.ts`, `next-answer-to-grade.ts` (`answerNeedsGrade`, `isGradableAnswer`, `isUnmarkedChoiceAnswer`, `findNextAnswerToGrade`), `grading-mode.ts` (`GradingMode`), `release-state.ts`, `teacher-own-grade.ts`, `apply-suggestion.ts`, `grading-screen-read.ts`, `grading-count-service.ts`, `test-status-service.ts`, `grade-service.ts`, `test-submission-service.ts` (`markChoiceAnswersForHandIns`, `releaseGradesToStudents`, `hasOpenRedo`), `test-service.ts` (`releaseGradesAndAnswers`), `annotation-service.ts`.
- Shared UI: `src/components/annotation-overlay.tsx`, `src/components/diff-viewer.tsx`, `src/app/admin/(dashboard)/leave-guard.state.tsx` (per-page title), `admin-sidebar.tsx`, `admin-sidebar-provider.tsx`, the `narrow` variant in `src/app/globals.css`.
- Student side: `src/app/student/(dashboard)/courses/[courseId]/tests/[testId]/actions.ts` (answer lock), `graded-question.tsx` (text marks).
- E2E: `e2e/grading-*.test.ts` (Behavior 51 in `e2e/grading-unmarked-choice.test.ts`; its vitest seed helper is `src/tests/seed-unmarked-choice.ts`), `e2e/to-grade.test.ts`; the e2e AI mock (`src/mocks/e2e-ai-mock.ts`) answers grading prompts, and `dev:e2e` blanks the real runner key.

## Commits

One commit per behavior, in behavior order. No co-author trailers.

- 1 `5a1c94c5` top bar · 2 `cfecfb00` empty states · 3 `fa43dd27` left pane · 4 `c7b0a233` compare with AI fix · 5 `812d5005` grade panel · 6 `0d6928da` overall feedback · 7 `7109424f` panes scroll · 8 `267563d8` unsaved warning · 9 `696ce611` question row · 10 `c8fe47e8` needs grading only
- 11 `04fd0d48` AI card · 12 `9ad7ccb2` Use · 13 `dad8b7eb` Replace your grade? · 14 `fc3d4e47` regenerate one · 15 `fb55024d` auto-grade · 16 `db52fb7a` regenerate all · 17 `a7a446bd` Save & next · 18 `ec39ef0b` grouped picker · 19 `8223f74d` picker search · 20 `ad9e3b09` next waiting student
- 21 `9f46b7a7` ‹ › stepping · 22 `7ebb9406` still writing from picker · 23 `c50cd578` still writing by link · 24 `bc4393ae` By question top bar · 25 `5b62194d` student row · 26 `27df261c` By question grade panel · 27 `3d4895af` release chip · 28 `5ba7a2e0` release correct answers · 29 `dc857a25` whole-test release · 30 `61e9f915` release from lists
- 31 `3068d29b` chosen students all or nothing · 32 `a29bcd61` checklist · 33 `874f5d8a` finish panel · 34 `36d19b03` finish release button · 35 `f9ee3ef5` next in To grade · 36 `66f67002` redo hand-in · 37 `f8267915` open redo locked · 38 `5cacf958` AI for changed answers · 39 `648ba214` answer changed · 40 `af93b322` release to one student
- 41 `3c442c0a` request redo · 42 `fd5f2d4f` answers lock · 43 `e210c929` practice answers only · 44 `2be7f387` practice to normal · 45 `7094b6cc` photo viewer · 46 `16dd6d8a` circle and arrow · 47 `70baf6c4` text marks · 48 `40060892` marks save with Save & next · 49 `e8a0003c` student sees text marks · 50 `b9413242` tablet layout · 51 `c8c8c608` mark multiple-choice answers

Behavior 49's code (the result page passing `texts` to the overlay, and its unit test) sits in commit 47; commit 49 holds the e2e student step that proves it.

The review fixes were folded into the commit that last touched their lines, so some commits carry fixes their subject does not name. Commit 43 (practice) carries the Save & next "was waiting" rule, the shared `answerNeedsGrade` rule and the release roster's picker order; commit 50 (tablet) carries the one-read By student view, the refresh helper, the single route-kind source and the "Grade anyway" and "Feedback cleared" fixes; commit 48 (photo marks) carries the grade-then-marks order and the Save & next failure display.

## Verification

- Quality checkpoints after every three behaviors, each with up to two re-checks; findings were folded into their behavior commits (`IMPLEMENTATION_PROGRESS.md`).
- Final check before the adversarial-review fixes: e2e 160 pass (3 timeouts under load passed alone), vitest 2270 of 2270, `tsc` clean, lint clean on `src` and `e2e`, every one of the 50 commits `tsc`-clean.
- Conformance: a validation note per behavior. Three mismatches were found and fixed: the By question choice legend, an old release action left exported, and picker rows that did not show the @username.
- Adversarial review: 86 risk entries in ten groups; no breaks. The silent-misbehavior findings the owner chose to fix were all fixed (view switch kept the wrong student, overall draft lost on Save & next, bare By question on a choice question, same-name picker rows, sidebar highlight, no-fix Use kept the old solution, misleading AI card and dialog wording, roster race, photo touch panning, edge text clipping, undo order across reopen, iOS zoom, folded-bar notes, dialog height).
- Re-validation after those fixes: every fixed item resolved except a missing height cap on confirmation dialogs, which was then added with its own e2e; vitest 2291 of 2291 (one load timeout passed alone); e2e 70 of 70 on the touched specs; `tsc` clean on all 50 commits of that stack.
- Mutation pass: 30 mutants on the needs-a-grade rule, counts, release and redo; 25 killed, 5 survived. One survivor was a real test gap (release to a student who redid the test); a test was added, with no code change, and was not re-run through the mutation harness. The other four are equivalent or need input the screen never sends.
- Code review at `5c470caa`: 19 findings, one must-fix (a grade did not record which answer it graded, so a grade saved while the student changed her answer could hide the new one). The owner chose to fix findings 1–3, 5–16, 18 and 19, the written-convention parts of 17, part of 4 (Save & next's second school-wide count read) and five known leftovers (D101). Most behavior fixes came with a test seen failing before the fix; the rest are test-only or no-behavior-change items covered by existing tests. A re-validation found every one resolved or partly resolved; the two partial ones (the number row on the shared rule, one more plan reference in a comment) and a `src/lib` import from `src/app` were then finished.
- Behavior 51 came out of finding 7 (D108–D112). Its quality checkpoint fixed four items: the unmarked check typed its grade loosely, a test helper comment, a still-writing student's choice answer counted as unmarked, and the By student line called an unmarked choice answer "written".
- Final check at `dacf7ff8` (51 commits): e2e over 30 specs plus auth setup, 224 passed, 2 failed and 10 did not run under load; the two failures were student-creation setup steps that timed out, and both specs passed when rerun alone (15 tests). Full vitest 337 files, 2334 tests: 2 failed on 5 s timeouts under load, and both files passed alone (27 tests). `tsc` clean, `biome check src e2e` clean, and every one of the 51 commits `tsc`-clean. The tip then gained one fix (an open-redo student's unmarked choice answer reads plain in the number row), checked with its vitest folder and tsc at `c8c8c608`.

## Open items

- **No tab-close warning.** Closing or reloading the tab loses an unsaved grade; the grading screen does not warn on tab close (the AI import page is the only admin page that does).
- **Finish panel only after Save & next.** Opening a test that is already fully graded shows the grade panel, not the finish panel.
- **Choice colours before grades are visible.** A student whose grade is hidden sees her choice answers coloured right or wrong once correct answers are released; this matches the whole-test release.
- **Expired attempt over an open redo.** For one page load such a student can read "Redo requested" before the hand-in is written; a reload fixes it (reported by the adversarial review, not re-checked).
- **Hand-in during the practice-to-normal switch.** The marking runs before the test is saved as normal; a student who hands in while it runs hands in on a practice test, so she gets no choice marks, and saving the settings again does not mark her because the test is already normal. Her choice answers read unmarked and the Mark multiple-choice answers button (Behavior 51) clears them (inferred from reading `settings-actions.ts` and `test-submission-service.ts`; not run).
- **By question choice legend has no "Needs grade" count.** An unmarked choice answer's box reads needs grading, but the legend on a choice question lists no needs-grade count (`question-row.tsx`).
- **Server-side gaps the screen never reaches.** An empty score posts as 0 (the form requires a score); whitespace-only text marks and stroke colours outside the palette are accepted by the server.
- **Text marks cannot be moved or edited** after they are kept; Undo or Clear photo removes them.

## Decisions

Decision numbers come from the stage decision log (workspace `tmp/revamp-stage-2/DECISIONS.md`, not committed; also on the AI-Kanban card). Replaced decisions: D39 by D53, D58 by D61, D63's name rule by D65, D63's fieldset by D67, D69's "as if already graded" by D71, D87 by D88. D17's single shared rule is refined by D106 (the screen's `answerNeedsGrade` layer) and D108 (the counts keep the time rule). Each entry names the behaviors it shaped.

- D1, D2: test level (Playwright e2e plus vitest on real Mongo) and the e2e AI mock. All behaviors.
- D3: every grading behavior today's tests protect stays (expired hand-in on open, AI job notes, stale flag, blank and choice rules, deleted questions, school isolation, long text, empty states). 1-3, 11.
- D4, D59, D60: picker groups and order, picker in the top bar, bare open. 18, 21.
- D5, D18, D85: practice shows answers only; old practice grades stay visible to students. 43.
- D6, D52, D53: Use over the teacher's own grade asks "Replace your grade?"; "Used" by content. 12, 13.
- D7, D16, D17: redo keeps grades, changed answers come back, one shared needs-a-grade rule. 9, 36, 39, Rules.
- D8, D13, D76: release from To grade and the Tests tab opens the dialog in place, loading the roster on open. 30.
- D9, D15: answers lock after hand-in, in the student's save action. 42.
- D10: one read per render. 1, Rules.
- D11, D35, D57, D61, D69, D71, D27: Save & next search, server redirect, labels, telemetry, By question order. 17, 26.
- D12, D36, D75: chosen-students release is all or nothing, with named refusals. 31.
- D14, D89, D90, D92, D93, D96: photo mark storage, viewer, text marks, scaling. 45-47, 49, Rules.
- D19: hidden h1. 1.
- D21, D73: chip only when nothing is left; top bar chip wording. 27.
- D22, D77: Next in To grade and the finish panel's lists. 33, 35.
- D23, D65: small redo, still-writing and next-waiting rules; full name in the still-writing dialog. 20, 22, 41, 43.
- D24: Regenerate all only for a waiting student. 16.
- D25, D31: Compare with AI fix and Use on a stale suggestion. 4, 12.
- D26, D40, D80, D81: open redo locks the student and counts nowhere. 21, 25, 37.
- D28, D82: AI drafts for changed answers. 38.
- D29, D94: marks save with Save & next; read-only photos. 48.
- D30, D41, D50: "Discard your unsaved grade?" via the admin leave guard, in both views. 8, 26.
- D32: per-student release must be given again after a redo. Rules.
- D33, D38, D42, D86, D88: practice to normal marks choice answers, keeping current choice grades. 44.
- D34, D51, D68: "Needs grading only" in the URL, in both views. 10, 25.
- D37: whole-test release sets times only when unset. 29.
- D43, D44: one outcome per behavior, one commit each. Commits.
- D45, D100: mutation pass and the one added test. Verification.
- D46: "Nobody has submitted yet." placement. 2.
- D47, D48: grade form placement, quick scores and the trailing-newline line count. 3, 5.
- D49, D54: history rows keep their own fix and Use; preview applies to the latest row. 11, 14.
- D56: Save & next is the only grade save button. 5, 17.
- D20, D55, D64: interim Save & next, More ▾ and form rules during the build; no lasting effect.
- D62: "Next waiting student" hidden while searching. 20.
- D63, D66, D67: "Grade anyway" on the lock note unlocks at once; the still-writing lock covers grading controls only. 23, 26.
- D70: By question box rules for still-writing, redo-locked and not-started students. 25.
- D72, D95: fill-the-screen layout and the narrow layout. 4, 7, 26, 50.
- D74: the release dialog posts through a transition and closes on success. 29.
- D78, D79: model choice and batch shape for the build; no product effect.
- D83, D84: Release to <student> and Request redo in More ▾. 40, 41.
- D91: Behavior 49's code sits in commit 47. Commits.
- D97: the grading visual tour cleans up its seeded tests. Verification.
- D98: both grading routes highlight To grade. 1.
- D99: the owner's fix list after the adversarial review. Verification, Open items.
- D101: the owner's fix list after the code review; the per-move school count stays. 6, 22, 30, 44, Verification.
- D102, D104: a grade stores the save time of the answer it graded (Use: the answer the AI read); grades without it fall back to their save time. 12, 17, Rules, Data rules.
- D103, D105: a failed Save & next stays on the answer, shows the reason and keeps the typed grade; photo marks are written after the grade. 17, 48.
- D106: one screen rule, `answerNeedsGrade`, for whether a gradable answer waits. 5, 9, 17, 24, 25, 38, 39, Rules.
- D107: Save & next reads counts for its own test and course only. Rules.
- D108: an unmarked choice answer keeps the student waiting in the counts and status. 51, Rules.
- D109, D111: the "Mark multiple-choice answers" button, its wording, failure line, box state and access rules. 51, Access.
- D110: Behavior 51 has its own commit. Commits.
- D112: Save & next and "Next waiting student" also stop at an unmarked choice answer. 17, 20, 51, Rules.
