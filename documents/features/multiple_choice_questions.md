# Multiple Choice Questions

## Overview

Extend the question system to support multiple choice questions alongside existing free-text questions. Two variants are supported: **single-select** (exactly one correct answer) and **multi-select** (one or more correct answers). Answers are auto-graded by comparing student selections against the correct answer(s).

## User Roles

- **Admin/Teacher**: Creates multiple choice questions with options and correct answers
- **Student**: Selects answer(s) from the provided options

## Acceptance Criteria

### Admin — Single-Select Questions

- [ ] Admin can create a multiple choice question with type `single_select`
- [ ] Admin specifies a list of options (minimum 2)
- [ ] Admin marks exactly one option as the correct answer
- [ ] Question is displayed with radio buttons on the student side
- [ ] System validates that exactly one option is marked correct on creation

### Admin — Multi-Select Questions

- [ ] Admin can create a multiple choice question with type `multi_select`
- [ ] Admin specifies a list of options (minimum 2)
- [ ] Admin marks one or more options as correct
- [ ] Question is displayed with checkboxes on the student side
- [ ] System validates that at least one option is marked correct on creation

### Student — Answering

- [ ] Student sees radio buttons for `single_select` questions
- [ ] Student sees checkboxes for `multi_select` questions
- [ ] Student can submit their selected option(s)
- [ ] Submission is rejected if no option is selected
- [ ] For `single_select`, submission is rejected if more than one option is selected

### Auto-Grading

- [ ] `single_select` answers are auto-graded: 100 if correct, 0 if wrong
- [ ] `multi_select` answers are auto-graded based on correct selections (e.g., partial credit or all-or-nothing — TBD)
- [ ] Teacher can override the auto-grade with a manual score and feedback

### Data Model

- [ ] Questions have a `type` field: `free_text` | `single_select` | `multi_select`
- [ ] Multiple choice questions store `options: { id, text, isCorrect }[]`
- [ ] Existing free-text questions continue to work unchanged (backward compatible)
- [ ] Student answers for MC questions store selected option ID(s)
