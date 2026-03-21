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

### Teacher — Grading Page UX (Planned)

- [ ] Grading page supports filtering students by grading status (e.g., show only ungraded)
- [ ] Grading page shows one student at a time (tabs or accordion) to reduce scrolling
- [ ] Grading page has sidebar for quick student navigation with grading status indicators

### Admin — Manage Questions

- [x] Admin can add a question with title and markdown content
- [x] Admin can import questions from a JSON file
- [x] Admin can view a list of questions for a test
- [ ] Admin can preview/review questions with rendered markdown (planned)
- [ ] Admin can edit existing questions
- [ ] Admin can reorder questions
- [ ] Admin can delete questions

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
- [x] Student can view their answer alongside the provided solution
- [x] Differences are displayed in a GitHub-style side-by-side diff view
- [x] If no solution is set for a question, no diff section is shown

### Test Association

- [x] Tests are associated with a specific course
- [x] Only enrolled students can access and submit tests

