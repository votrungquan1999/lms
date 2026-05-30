# ADR: AI-Assisted Question Import from Documents

**Date:** 2026-04-12
**Status:** Accepted — **not yet implemented** (as of 2026-05-30; only TypeScript-CLI and JSON-upload import exist; .docx/.pdf AI import is unbuilt)
**Deciders:** Project Owner

## Context

Teachers have test content in Word documents (.docx) or PDFs but the LMS only accepts structured data for question import (TypeScript data files via CLI script, or JSON file upload via the admin UI). Teachers cannot easily convert their existing documents into the required structured format.

The core challenge is reliably extracting structured question data — title, description, question type, options, and correct answers — from unstructured document formats where there is no universal convention for how these elements are marked.

### Current import methods

| Method                                    | Format                    | Audience             |
| ----------------------------------------- | ------------------------- | -------------------- |
| CLI script (`bun scripts/create-test.ts`) | TypeScript data file      | Developer / AI agent |
| Admin UI upload (`ImportQuestionsForm`)   | JSON file                 | Admin / Teacher      |
| Admin UI form (`AddQuestionForm`)         | Manual input per question | Admin / Teacher      |

## Decision

### Overall Approach: AI-Assisted Conversion

Teacher uploads a document file → system extracts text → LLM parses into structured questions → teacher reviews and corrects → system imports into database.

```
Upload .docx/.pdf → Client-side text extraction → Server sends to LLM
    → LLM returns QuestionDefinition[] → Preview list → Teacher reviews
    → Edit / AI retry if needed → Confirm → Import to database
```

### Key Design Decisions

#### 1. Input Method: Client-Side File Parsing

- Teacher uploads a `.docx` or `.pdf` file through the admin UI
- File is parsed to plain text **in the browser** using `mammoth.js` (for .docx) or `pdfjs-dist` (for .pdf)
- Only the extracted text is sent to the server — no binary file upload needed
- Server API always receives `{ text: string }`, keeping the backend simple

**Phasing:**

- Phase 1: `.docx` support via mammoth.js (~100KB bundle)
- Phase 2: `.pdf` support via pdfjs-dist (~500KB bundle)

**Rejected alternatives:**

- _Server-side parsing:_ Adds multipart upload handling, temp file storage — unnecessary complexity when client-side works
- _Paste-only:_ If a teacher can copy-paste, they can export a file — file upload is fewer steps

#### 2. Review UX: Preview List + Inline Edit + AI Retry

After AI parsing, the teacher sees a list of question cards. For each question:

- **Preview card** shows: title, type, content snippet, options (if MC)
- **Edit button** opens an inline or modal form to manually fix fields
- **Retry with AI button** lets the teacher type a correction note (e.g., "this should be multiple choice"); the system re-sends the original text + current parse + correction note to the LLM for a single-question re-parse
- **Import All** button saves all questions to the database

**Rejected alternatives:**

- _Side-by-side view:_ High implementation complexity (source-range mapping, synchronized scrolling)
- _Step-by-step wizard:_ Tedious when most questions are correct; can't get a quick overview

#### 3. LLM: Gemini 2.5 Flash via Vercel AI SDK

- **Provider:** Google Gemini
- **Model:** `gemini-2.5-flash` (configurable via `GEMINI_MODEL` env var)
- **SDK:** Vercel AI SDK (`ai` + `@ai-sdk/google`) with `generateText` + `Output.object()`
- **Schema enforcement:** Zod schema with `.describe()` annotations to guide the LLM
- **Cost:** ~$0.01 per import (~5K token document)

**Why Flash over Pro:**

- The task is primarily pattern matching (split questions, detect types, extract options) — Flash handles this well
- The review step catches any errors, so slightly lower accuracy is acceptable
- Flash is 4x cheaper than Pro; even Pro is affordable (~$0.06/import) but not needed initially
- The model is configurable — upgrade to Pro with a one-line env var change if accuracy is insufficient

**Why Gemini over OpenAI/Anthropic:**

- Cheapest option for structured extraction
- Native JSON schema support in the API
- Vercel AI SDK makes provider-swapping trivial if needed later

## Implementation Outline

### New packages

```
pnpm add ai @ai-sdk/google mammoth
```

### File structure

```
src/
  lib/
    ai/
      parse-questions.ts     # parseQuestionsWithAI(), retryQuestionWithAI()
      schema.ts              # Zod schema for QuestionDefinition
  app/
    admin/(dashboard)/courses/[courseId]/tests/[testId]/
      import-ai/
        page.tsx             # File upload + AI parse flow page
        actions.ts           # Server actions
        question-preview.tsx # Preview card component
        question-edit-modal.tsx # Edit modal for a single question
```

### Environment variables

```
GOOGLE_GENERATIVE_AI_API_KEY=...   # Required: Gemini API key
GEMINI_MODEL=gemini-2.5-flash     # Optional: model override (default: gemini-2.5-flash)
```

### System prompt (draft)

The LLM is instructed to:

1. Split the document into individual questions
2. Extract title (question number/heading) and content (full body as markdown)
3. Infer question type: `free_text`, `single_select`, or `multi_select`
4. For MC questions, extract options and identify correct answers from common markers (✓, bold, "Answer: B", etc.)
5. If the correct answer cannot be determined, set all options to `isCorrect: false` for teacher to fix
6. Preserve original content without rephrasing

## Consequences

### Positive

- Teachers can import tests from their existing Word documents without learning a new format
- AI handles the tedious extraction work; teacher only reviews and corrects
- Per-question AI retry gives a natural language correction mechanism
- Cost is negligible (~$0.01/import) even at scale
- Model is swappable via env var — easy to upgrade or change providers

### Negative

- External dependency on Google Gemini API (requires API key, internet, availability)
- LLM output is non-deterministic — same document may produce slightly different results on re-parse
- Adds ~100KB to client bundle (mammoth.js)
- Privacy consideration: test content is sent to Google's API

### Risks

- No customer documents yet — prompt may need refinement once real documents are tested
- PDF extraction quality varies by document (especially complex layouts or scanned PDFs)
- Gemini API pricing or model availability could change
