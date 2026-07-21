# Post-Demo Improvements

Collected after the customer demo on 2026-03-22. Items are grouped by priority and tracked as a planning checklist.

---

## 🔴 High Priority — Flow & UX Smoothness

> Focus on making the teacher workflow and question upload flow smoother.

### Teacher — Manage Questions

- [x] Clear the add-question form automatically after a question is successfully added — `key={successCount}` remount in `add-question-form.tsx`
- [x] Allow `content` field to be empty (some questions rely only on a title or image) — `content: z.string().default("")` in the add-question action; grading view guards on truthy content
- [x] Allow teacher to upload images for individual questions — media attachments via S3 presigned uploads + CloudFront; ordered media shown to students and graders (`PLAN_STEPS.md` steps 1–7)

### Teacher — Grading

- [x] Display MC question answers in a visual format on the grading page (highlight selected choice(s)) instead of raw text — `mc-answer-chips.tsx`
- [x] Allow teacher to mark a student's test as "needs redo", prompting the student to resubmit — `redo-request-service.ts` + grading/student UI
- [x] Allow teacher to regenerate AI grading for a single question, not just re-run AI grading for the whole test/list — per-question regenerate control on the grading page (steps A1–A3 in `tmp/pools-and-per-question-ai/PLAN_STEPS.md`)

### Teacher — Results & Export

- [x] Export a single student's results as a PDF report — admin picks one student + one or more tests and downloads a rendered PDF (`courses/[courseId]/results-report/` page + `download/route.ts`)
- [ ] Export a whole class's results as CSV/Excel (gradebook view: all students × scores/feedback/per-question breakdown in one sheet) — distinct from the shipped per-student PDF report above; `xlsx` is currently used only for student import, not export

---

## 🟡 Medium Priority — Test Configuration

### Teacher — Student Management

- [x] Bulk-create students by uploading a CSV/Excel file (columns: name, username, password) — `students/parse-import-file.ts` (lazy-loads `xlsx`) + `bulk-import-dialog.ui.tsx`; reduces onboarding friction for classroom teachers adding a whole class at once

### Test Settings

- [ ] Allow a test to be configured for multiple retakes (student can retake if settings allow)
- [ ] Support random question selection per attempt — serve a random subset per attempt (e.g., 10 of 40) for practice use. NOTE: global question pools now exist (`tmp/pools-and-per-question-ai/PLAN_STEPS.md` steps B1–B5c), but a test composed from pools currently snapshots a fixed set at creation — every student gets the same questions. This item is the remaining per-attempt randomization on top of that pool model.
- [x] Add timed test mode — student has a fixed countdown after clicking Start; test auto-submits when time runs out — admin sets `timeLimitMinutes` in the test settings panel; `test_start` records `startedAt` per student; `countdown.state.tsx` renders the live timer and auto-submits at zero; `isPastEnforcementDeadline` (`enforcement-deadline.ts`) gates both the submit and answer-write paths server-side

### Export

- [ ] Allow teacher to export a test (questions ± answer key) to PDF for offline distribution

---

## 🟢 Low Priority — Advanced Features

### Import

- [ ] **(Deferred)** AI-powered test generation from an uploaded file — teacher uploads a test file (`.docx` or `.pdf`) containing questions, and AI parses the file and generates the test's questions (title, content, type, options) for the teacher to review and edit. Depends on the existing Gemini client. Deferred until after the bulk-student-import work; revisit once file-upload/storage infrastructure exists.

### Math Support

- [ ] Add a math formula editor (LaTeX / MathML) for teachers writing questions and students submitting answers
