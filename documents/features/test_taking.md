# Test Taking

## Overview

Students take tests by submitting their solutions. Teachers input the correct/expected solutions. A diff-based comparison view (similar to git diff) shows students the differences between their submitted solution and the correct one.

## User Roles

- **Teacher/Admin**: Inputs correct solutions for tests
- **Student**: Submits solutions and views diff comparison

## Acceptance Criteria

### Teacher — Manage Tests

- [x] Teacher can create a test with a title and description
- [ ] Teacher can input the correct/expected solution for a test
- [ ] Teacher can update the correct solution

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

### Student — View Diff Comparison

- [ ] Student can view their submitted solution alongside the correct solution
- [ ] Differences are displayed in a git-diff style view (additions in green, deletions in red)
- [ ] Line-by-line comparison clearly highlights where the student's answer differs

### Test Association

- [x] Tests are associated with a specific course
- [x] Only enrolled students can access and submit tests
