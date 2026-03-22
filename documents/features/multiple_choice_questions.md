# Multiple Choice Questions

## Overview

Extend the question system to support multiple choice questions alongside existing free-text questions. Two variants are supported: **single-select** (exactly one correct answer) and **multi-select** (one or more correct answers). Answers are auto-graded by comparing student selections against the correct answer(s).

## User Roles

- **Admin/Teacher**: Creates multiple choice questions with options and correct answers via the sidebar question-type picker
- **Student**: Selects answer(s) from the provided options using radio buttons or checkboxes

## Acceptance Criteria

### Admin — Single-Select Questions

- [x] Admin can create a multiple choice question with type `single_select`
- [x] Admin specifies a list of options (minimum 2, add/remove dynamically)
- [x] Admin marks exactly one option as the correct answer (radio button in the form)
- [x] Question is displayed with radio buttons on the student side
- [x] System validates that exactly one option is marked correct on creation

### Admin — Multi-Select Questions

- [x] Admin can create a multiple choice question with type `multi_select`
- [x] Admin specifies a list of options (minimum 2)
- [x] Admin marks one or more options as correct (checkboxes in the form)
- [x] Question is displayed with checkboxes on the student side
- [x] System validates that at least one option is marked correct on creation

### Admin — Question Type Picker UI

- [x] Admin `AddQuestionForm` has a sidebar on the left with three type buttons: **Free Text**, **Single Select**, **Multi Select**
- [x] Selecting a type switches the right panel to show the appropriate form fields
- [x] MC types show an options builder (add/remove options, mark correct answers)

### Student — Answering

- [x] Student sees radio buttons for `single_select` questions
- [x] Student sees checkboxes for `multi_select` questions
- [x] Student can submit their selected option(s)
- [x] Submission is rejected if no option is selected
- [x] For `single_select`, only one option can be selected at a time

### Auto-Grading

- [x] `single_select` answers are auto-graded: 100 if correct, 0 if wrong
- [x] `multi_select` answers are auto-graded: 100 if all correct options are selected and no incorrect ones, 0 otherwise
- [x] Auto-grading runs automatically when a student submits the test (`TestSubmissionService`)
- [x] Teacher can override the auto-grade with a manual score and feedback

### Atomic Reveal

- [x] MC grades are **not** surfaced until **all** questions in the test have a grade (manual or auto)
- [x] `GradeService.getStudentGrades` enforces: `testStatus === Graded` AND `showGradeAfterSubmit` flag
- [x] Student sees "submitted — waiting to be graded" until the free-text question is manually graded by the teacher
- [x] Admin can separately release grades (`gradesReleasedAt`) and correct answers (`correctAnswersReleasedAt`)

### Admin Grading UI

- [x] Admin grading page shows the student's MC answer as human-readable option text (e.g., `[MC] Paris`)
- [x] MC questions with auto-grades show `value="100"` pre-filled in the score input; admin can override

### Data Model

- [x] Questions have a `type` field: `free_text` | `single_select` | `multi_select`
- [x] Multiple choice questions store `options: { id, text, isCorrect }[]`
- [x] MC grading strategy stored as `mcGradingStrategy: "exact_match"` (extensible)
- [x] Existing free-text questions continue to work unchanged (backward compatible)
- [x] Student answers for MC questions stored as `{ type: "mc"; selectedIds: string[] }` (discriminated union)
- [x] Legacy plain-string answers are coerced to `{ type: "free_text"; text: string }` on read
