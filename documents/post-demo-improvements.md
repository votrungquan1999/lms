# Post-Demo Improvements

Collected after the customer demo on 2026-03-22. Items are grouped by priority and tracked as a planning checklist.

---

## 🔴 High Priority — Flow & UX Smoothness

> Focus on making the teacher workflow and question upload flow smoother.

### Teacher — Manage Questions

- [x] Clear the add-question form automatically after a question is successfully added — `key={successCount}` remount in `add-question-form.tsx`
- [x] Allow `content` field to be empty (some questions rely only on a title or image) — `content: z.string().default("")` in the add-question action; grading view guards on truthy content
- [ ] Allow teacher to upload images for individual questions — blocked on file-storage infrastructure (none exists yet)

### Teacher — Grading

- [x] Display MC question answers in a visual format on the grading page (highlight selected choice(s)) instead of raw text — `mc-answer-chips.tsx`
- [x] Allow teacher to mark a student's test as "needs redo", prompting the student to resubmit — `redo-request-service.ts` + grading/student UI
- [ ] Allow teacher to regenerate AI grading for a single question, not just re-run AI grading for the whole test/list — per-question regenerate control on the grading page so a teacher can re-grade one question's answer without redoing the entire submission

### Teacher — Results & Export

- [ ] Allow teacher to export student results for a test (scores, feedback, per-question breakdown) as CSV/Excel

---

## 🟡 Medium Priority — Test Configuration

### Teacher — Student Management

- [ ] Bulk-create students by uploading a CSV/Excel file (columns: name, username, password) — reduces onboarding friction for classroom teachers adding a whole class at once. Builds on the existing admin-only `registerStudent` flow; needs row validation, duplicate-username handling, and a per-row success/error report.

### Test Settings

- [ ] Allow a test to be configured for multiple retakes (student can retake if settings allow)
- [ ] Support random question selection per attempt — define a question pool (e.g., 40 questions), serve a random subset per attempt (e.g., 10) for practice use
- [ ] Add timed test mode — student has a fixed countdown after clicking Start; test auto-submits when time runs out

### Export

- [ ] Allow teacher to export a test (questions ± answer key) to PDF for offline distribution

---

## 🟢 Low Priority — Advanced Features

### Import

- [ ] **(Deferred)** AI-powered test generation from an uploaded file — teacher uploads a test file (`.docx` or `.pdf`) containing questions, and AI parses the file and generates the test's questions (title, content, type, options) for the teacher to review and edit. Depends on the existing Gemini client. Deferred until after the bulk-student-import work; revisit once file-upload/storage infrastructure exists.

### Math Support

- [ ] Add a math formula editor (LaTeX / MathML) for teachers writing questions and students submitting answers
