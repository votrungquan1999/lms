# Plan: Bulk Student Import (CSV / XLSX)

## Goal

Let an admin/teacher onboard a whole class at once by uploading a **CSV or XLSX**
file with columns `name`, `username`, `password`. The flow is two-stage:

1. **Upload → Preview** — client validates the file *format*; the server returns a
   per-row **preview** (what will happen on confirm: new / duplicate / invalid).
2. **Confirm → Create** — server creates each valid student, optionally enrolls them
   into selected course(s), and returns a **per-row success/failure report**.

## Decisions (confirmed with user)

- **File formats:** both `.csv` and `.xlsx` (Excel / Google Sheets export). Must-have for VN/Windows users.
- **Passwords:** supplied by the teacher in the file; validated (≥ 8 chars, like single-create).
- **Parsing split:** client parses for **format** validation (headers present, file readable, rows extractable); server does **business** validation (existing username in DB, duplicate within file, field/password rules) and returns the preview.
- **Course enrollment:** optional — teacher can pick course(s) to enroll the imported students into, reusing the existing `EnrollmentService.enrollStudents`.
- **Partial failure:** import valid rows, skip/report invalid ones per-row (no all-or-nothing).
- **Library:** SheetJS `xlsx` (popular, parses both csv + xlsx), added via `pnpm`. Used client-side only — the server receives parsed JSON rows, not the raw file.

## Non-goals (explicitly out of scope)

- No auto-generated passwords (teacher provides them).
- No downloadable credential export.
- No editing rows inline in the preview (re-upload a corrected file instead).
- No update/upsert of existing students (duplicates are reported, not modified).

---

## Steps

### Step 1: Add `xlsx` dependency + client-side file-parsing utility

**AC:**
- `xlsx` (SheetJS) installed via `pnpm`.
- A pure client utility parses a selected `.csv`/`.xlsx` `File` into an array of raw
  row objects (`name`, `username`, `password`).
- Returns a **format error** when: file unreadable, no rows, or required header
  columns are missing. Trims whitespace; ignores fully-empty rows.

**Test Type:** unit

**Dependencies:** none

---

### Step 2: `StudentService` — look up existing usernames for a batch

**AC:**
- A new read method returns which of a given list of usernames already exist in the
  `student` collection (single query, not N queries).

**Test Type:** unit (service)

**Dependencies:** none

---

### Step 3: Server action — validate rows and return a preview

**AC:**
- Admin-gated server action accepts parsed rows and returns a **per-row preview**
  status: `valid` (new), or an error reason — missing field, password too short,
  duplicate username *within the file*, or username *already exists* in DB.
- Returns a summary count (e.g. X to create, Y errors).
- Does **not** write anything.

**Test Type:** integration (action + service + db)

**Dependencies:** Step 2

---

### Step 4: Server action — bulk create + optional enrollment + report

**AC:**
- Admin-gated server action re-validates rows server-side (never trusts the client),
  then creates each valid student via the existing `registerStudent` flow.
- Optionally enrolls all successfully-created students into the selected course id(s)
  via `EnrollmentService.enrollStudents`.
- Returns a **per-row report**: created vs failed (with reason). One row failing does
  not abort the rest.
- `revalidatePath('/admin/students')` on completion.

**Test Type:** integration (action + services + db)

**Dependencies:** Steps 2, 3

---

### Step 5: Bulk-import UI (upload → preview → course picker → confirm → report)

**AC:**
- Entry point on the Students page (alongside "Add Student") opens a bulk-import surface.
- Stage 1: file picker; client parses + shows format errors inline; on success calls
  the preview action (Step 3) and renders a preview table marking each row's status.
- Course picker (optional, multi-select) listing available courses.
- "Import" is enabled only when there is ≥ 1 valid row; calls Step 4 and renders the
  final per-row report. Follows the project's server/client component + `.state`/`.ui` conventions.

**Test Type:** component (React Testing Library)

**Dependencies:** Steps 1, 3, 4

---

## Risks / Notes

- **Plaintext passwords in a file** — document the security trade-off; the teacher is
  responsible for the file. (Auto-generate could be a later enhancement.)
- **Bundle size** — `xlsx` is client-side; load it only in the import component (lazy)
  so it doesn't bloat the main bundle.
- **Non-transactional bulk create** — partial success is expected and surfaced in the
  report; a mid-batch failure leaves earlier creates in place (acceptable per design).
- **Large files** — consider a sane row cap (e.g. a few hundred) to bound request size
  and latency on the Atlas M0 tier; confirm limit during implementation.
- **300-line file rule** — UI will be split across `.tsx`/`.ui.tsx`/`.state.tsx`/`.type.ts`.
```
