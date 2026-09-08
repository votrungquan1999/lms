# Test Taking

## Overview

Students take tests by submitting their solutions. Teachers grade each question with a score (0–100) and feedback, optionally providing a per-student correct solution. A diff-based comparison view (similar to GitHub's side-by-side diff) shows students the differences between their submitted answer and the provided solution. Test status is tracked as: not started, in progress, submitted, graded.

## User Roles

- **Teacher/Admin**: Grades student answers, provides feedback and optional solutions
- **Student**: Submits answers, views grades/feedback, sees diff comparison

## Acceptance Criteria

### Teacher — Manage Tests

- [x] Teacher can create a test with a title and description
- [x] Teacher can grade a student's answer with score (0–100) and feedback
- [x] Teacher can provide an optional per-student solution alongside the grade
- [x] Teacher can update a grade, feedback, or solution after initial grading
- [x] Teacher can provide overall free-text feedback for a student's test
- [x] Average score is automatically calculated when all questions are graded
- [x] Teacher can view all students' latest submissions for a test
- [x] Teacher can withhold correct answers at first, then release them later
      from either grading page; the release control is offered only while it
      is needed — not when answers already show automatically, and not once
      they have been released
- [x] Releasing correct answers is one-way: saving test settings afterwards
      never un-releases them, so a student who has seen the answer cannot have
      it taken back

### Teacher — Grading Page UX (Planned)

- [ ] Grading page supports filtering students by grading status (e.g., show only ungraded)
- [ ] Grading page shows one student at a time (tabs or accordion) to reduce scrolling
- [ ] Grading page has sidebar for quick student navigation with grading status indicators

### Admin — Manage Questions

- [x] Admin can add a question with title and markdown content
- [x] Admin can import questions from a JSON file
- [x] Admin can view a list of questions for a test
- [ ] Admin can preview/review questions with rendered markdown (planned)
- [x] Admin can edit existing questions (see [question_editing.md](question_editing.md))
- [ ] Admin can reorder questions
- [x] Admin can delete questions (soft delete — see [question_editing.md](question_editing.md))

### Student — Submit Solution

- [x] Student can view available tests for their courses
- [x] Student can write and submit their solution for a test
- [x] Student can update their submission before a deadline (if applicable)
- [x] Student receives confirmation after successful submission

### Test Status

- [x] Test status is derived: not_started, in_progress, submitted, graded
- [x] Student sees their test status on the course page
- [x] Teacher sees per-student status for each test

### Student — View Grade & Diff Comparison

- [x] Student can see their score per question and the overall average
- [x] Student can see free-text feedback per question and overall test feedback
- [x] A test's answer-reveal mode ("diff" or "plain") decides how a free-text
      answer is revealed; a question may override its test's mode
- [x] A newly created test defaults to "plain"; a test that predates this
      setting, or is otherwise missing the field, reads as "diff"
- [x] The mode applies to free-text questions only; multiple-choice and image
      questions are untouched by it
- [x] In "diff" mode, student can view their answer alongside the provided
      solution, with differences shown in a GitHub-style side-by-side diff view
- [x] In "plain" mode, student sees their own answer and the correct answer
      written out as text, instead of a diff
- [x] If no solution is set for a question, no diff section is shown (diff
      mode)
- [x] Plain mode falls back to the question's authored model answer when no
      solution is set
- [x] In either mode, the correct answer stays withheld until the teacher
      releases correct answers for the test; before that, the student sees
      only their own submitted answer
- [x] Once answers are released, the teacher's explanation becomes visible
      alongside the answer
- [x] In diff mode, when the student's answer already matches the solution,
      the side-by-side comparison is suppressed; the setting has help text
      explaining when to turn it on
- [x] Practice mode uses its own reveal gate, separate from the correct-answer
      release gate that governs the graded view
- [x] The model answer and explanation are stripped from the response on the
      server, based on submission state — not merely hidden in the rendered
      page, so a student who hasn't submitted cannot recover them from the
      network response

### Test Association

- [x] Tests are associated with a specific course
- [x] Only enrolled students can access and submit tests

