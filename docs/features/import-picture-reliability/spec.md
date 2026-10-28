# Import picture reliability

Living spec for the document import (`import-ai`) in the LMS admin. Covers how pictures from a Word/PDF document get attached to exam questions, which AI model reads the document, and how every AI request is recorded.

- Decisions: `tmp/import-picture-reliability/DECISIONS.md` (D45-D106; not committed)
- ADR: [documents/adr/import-ai-provider-and-usage-records.md](../../../documents/adr/import-ai-provider-and-usage-records.md)
- Status: Behaviors 1-12 done and committed on branch `test/real-ai-import-e2e` (tip `cce6697`, unpushed). Behavior 13 has its infra commit on `feat/lms-anthropic-key` in personal-infra (`b859c7c`, unpushed); its PR is not open.

## Terms

- **Marker**: the text `[image N]` that the AI leaves in a question where a picture belongs. `N` is the picture's number in the document. Reader accepts any letter case and spaces or tabs inside the brackets (also none, e.g. `[image3]`); a line break inside makes it plain text.
- **Draft**: an AI-read question on the review screen before it is saved to the exam.
- **Unused pictures**: document pictures that no draft question uses yet.
- **Read**: one AI call that turns the whole document into drafts. **Re-read**: an AI call for one question, via "Retry with AI" (not to be confused with the refusal re-read in Behavior 4).

## Environment variables

- `AI_IMPORT_PROVIDER`: `claude` (default when unset or empty) or `gemini`. Read on every call, no restart needed.
- `CLAUDE_MODEL_ID`: overrides the Claude model for the first request of a read (default `claude-sonnet-5-5`).
- `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`: provider keys. `ANTHROPIC_BASE_URL`: read by the Anthropic SDK.
- `AI_USAGE_FILE`: usage file path (default `tmp/ai-usage.jsonl`, resolved from the server's cwd).
- `AI_USAGE_RUN_ID`: copied into every record as `run_id`, so one run's records can be told from earlier ones.
- `AI_USAGE_ENV=demo`: tags records `demo` (see the tag order in Behavior 1).
- `E2E_MOCK_AI=1`: turns on the MSW AI mock (`src/mocks/e2e-ai-mock.ts`) and tags records `e2e-mock`.

## Behaviors

### 1. Every AI provider request is recorded
- Each HTTP request to the AI provider (Claude or Gemini, import or grading) produces one `ai.provider.request` span (child of the operation's span), one `ai_request {...}` log line, and, unless `VERCEL` is set, one JSON line appended to the usage file. Retries by the AI SDK and the refusal re-read are separate requests, each recorded.
- Record fields: `ts`, `provider` (`anthropic` or `gcp.gemini`), `operation` (e.g. `import.parseQuestionsFromText`), `host`, `model_requested`, `model_served`, `request_id`, `status`, `outcome`, `attempt` (counted per operation across all its requests), `duration_ms`, `key_fingerprint`, `input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `block_reason` (Gemini), `finish_reason`, `stop_category` (Claude refusal category), `fallbacks_requested` (Claude: whether the body carried `fallbacks`), `reason` (`refusal_retry` on the refusal re-read), `environment`, `mock`, `run_id`. Unset fields are omitted. The span carries the same data as attributes.
- Outcomes: `ok`, `http_error` (non-2xx), `network_error`, `aborted` (AbortError), `timeout` (TimeoutError, e.g. the 240 s budget elapsing). A body that cannot be read after the headers arrive keeps the status and gets the cut-short outcome.
- `key_fingerprint` is the first 8 hex chars of SHA-256 of the key header (`x-api-key` or `x-goog-api-key`); absent when the request has no key.
- Reply fields are read leniently: a null or wrong-type field drops only itself, never the other fields.
- Environment tag, first match wins: `test` (Vitest), the `VERCEL_ENV` value, `e2e-mock` (`E2E_MOCK_AI=1`, also sets `mock: true`), `demo` (`AI_USAGE_ENV=demo`), else `local`.
- The key, prompt text and reply text never appear in spans, logs or the usage file.
- If recording fails (e.g. the usage file cannot be written), the read continues and the server logs a warning; the span attributes and log line are written before the file.

### 2. Automated tests cannot reach a real AI provider
- Vitest setup (`src/tests/harden-ai-environment.ts`, `src/tests/setup.ts`) overwrites both provider keys with fake ones even if the shell has real ones, deletes `ANTHROPIC_BASE_URL`, points `AI_USAGE_FILE` at a fresh temp file, and replaces `fetch` with one that throws on `api.anthropic.com` and `generativelanguage.googleapis.com`.
- The e2e AI mock (MSW) answers both providers with the same canned batch. Any request to a provider host it does not answer fails with a 500. Other hosts pass through.
- The mocked e2e suite (`playwright.config.ts`) never reuses a running server (`reuseExistingServer: false`), defaults `AI_USAGE_RUN_ID` to the start time, and passes it to the server. Its records are tagged `e2e-mock` and, since `dev:e2e` sets no `AI_USAGE_FILE`, land in the repo's `tmp/ai-usage.jsonl`. Only Vitest uses a temp usage file.

### 3. Import reads use Claude Sonnet 5.5, switchable to Gemini
- Unset or empty `AI_IMPORT_PROVIDER` means `claude`; `gemini` keeps the Gemini path. Any other value throws `AI_IMPORT_PROVIDER must be one of claude, gemini`; the teacher is told to contact the site owner (the `ImportProviderSettingError` cause message in `src/lib/ai/ai-failure-messages.ts`)
- Claude reads use `claude-sonnet-5-5` (or `CLAUDE_MODEL_ID`) with an output cap of 32,000 tokens. Each request has a 240 s timeout (both providers).
- The AI SDK's default retries stay on, so one read can send up to 3 requests on 429/5xx/network errors; each is recorded.
- Grading stays on Gemini.

### 4. A Claude read refused by a safety filter is re-read once on Haiku 4.5
- A refusal (finish reason `content-filter`) on Claude triggers one re-read on `claude-haiku-4-5`, for every refusal category. The re-read request is recorded with `reason: refusal_retry`.
- The re-read gets only what is left of the same 240 s budget. If under 10 s remain, no re-read starts and the read fails as a refusal.
- No re-read for Gemini, or when the first request already used `claude-haiku-4-5`. A refusal from Haiku fails the read.
- If the re-read errors, or finishes without a usable answer, the span still counts the refused attempt's tokens.
- No request asks for Anthropic's server-side fallback (`fallbacks_requested` stays false).
- The teacher is not told that Haiku read the document; only the usage records show it.

### 5. Unused pictures appear above the review list
- On the review screen, in the teacher view only (not the student preview), above the question list, each document picture that no draft uses is listed with a question dropdown and an Add button.
- Derived from the drafts on every render. Only pictures actually extracted from the document appear.

### 6. A teacher adds an unused picture to a chosen question
- Add is disabled until a question is chosen. Add attaches the picture to that question without marking the draft as hand-edited.
- Save on a question's edit form leaves its pictures alone, so a picture added while the form was open is not undone.
- Add, Remove and "Retry with AI" are disabled while a read or an import runs.
- While any "Retry with AI" runs, Import is disabled. The teacher can cancel a running retry ("Cancel retry", or closing the dialog): its result is dropped and Import unlocks. Cancel does not stop the server-side AI call, which still completes and is recorded.

### 7. A question cannot get a fourth picture
- When the chosen question already shows 3 pictures (`MAX_MEDIA_PER_QUESTION`), Add is disabled and the text "A question can have at most 3 pictures." appears. It is derived from state, so it clears when another question is chosen or a picture is removed.
- An AI draft with 4 or more pictures stays fully attached, and its card shows the same warning at once. Removing one picture moves it to Unused pictures.
- No warning is shown when importing with pictures still unused.

### 8. A draft's pictures come from the markers in its text
- The AI reply carries no picture list; pictures come only from markers in a question's title, content or option text, limited to the picture numbers the browser sent with the parse request (none for a PDF).
- Markers are removed from the text. A line holding only markers is dropped. A marker between two letters/digits is replaced by a space so words do not fuse. A marker with a line break inside is plain text and stays.
- A picture whose marker is missing or in an odd form waits in Unused pictures and can be added by hand.
- A title, content or option that held only markers becomes "Picture N" (several: "Pictures N, M"), naming the numbers its markers held.
- A title, content or option that is empty (for example cleared by hand) refuses Import and names the field, e.g. `Question 5 ("<title>"): option 2 is empty` (`title is empty`, `content is empty`). In the student preview the card shows `Question N: <title> — option 2 is empty`; on the Teacher card it reads `Question N — option 2 is empty`.

### 9. Markers in a model answer or explanation never attach a picture
- Markers in the reference answer or explanation are stripped from that text and their pictures are not attached (they would show before students answer). The picture waits in Unused pictures.
- A reference answer or explanation that is blank after stripping is left out and does not fail the import.

### 10. A re-read of one question keeps its pictures
- The re-read request carries no picture numbers and the reply carries no picture list: markers in the reply's text are stripped and never attach a picture.
- The request does not mention the draft's pictures.
- The result replaces the question's text fields and clears its hand-edited flag; the question keeps the pictures it had, including ones the teacher moved in or added from Unused pictures.

### 11. Each import records how many pictures were attached and unused
- The full read's trace carries `lms.ai.pictures_in_document`, `lms.ai.pictures_attached` and `lms.ai.pictures_unused`, counted from the final drafts (so a refusal re-read is included). A picture shared by two drafts counts once.
- "In document" is the number of distinct picture numbers the browser sent with the parse request, not numbers found in text.
- A "Retry with AI" re-read carries no picture counts.
- No exam text is recorded.

### 12. The owner's paid demo runs on Claude and reports its own usage
- Run with `pnpm test:e2e:real-ai` (`playwright.real-ai.config.ts`, spec `e2e/import-ai-real.real-ai.ts`). Port 3005, database `lms_e2e_real_ai`, `reuseExistingServer: false`, one paid read per run.
- The server env is built by `buildDemoServerEnv` (`e2e/real-ai-env.ts`): the key comes from the gitignored `.env.e2e-real.local` (`ANTHROPIC_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` when `AI_IMPORT_PROVIDER=gemini`), parsed from the file so a shell key cannot win. It also sets `AI_USAGE_RUN_ID` (start time with `:` and `.` replaced by `-`), `AI_USAGE_ENV=demo`, `ANTHROPIC_BASE_URL=https://api.anthropic.com/v1` and `AI_USAGE_FILE` as the repo's `tmp/ai-usage.jsonl`. The demo shares that file with other runs and tells its own records apart by run id.
- Its run record (`tmp/real-ai-runs/<run id>.json`) holds provider, model, read seconds (first parse reply only), the Unused pictures list, the run's token totals per served model, environments, key fingerprints, and the key file's own fingerprint.
- Soft checks: at least one record for the run, all records tagged `demo`, all fingerprints equal the key file's, and (unless `CLAUDE_MODEL_ID` is set or provider is Gemini) the first read was served by `claude-sonnet-5-5`.
- Unmarked pictures are reported as waiting in Unused; the demo never adds them.
- A picture the AI placed on a question other than its own is tolerated for the exam's stray picture 5 (a screenshot beside Câu 8); in the paid run it landed on Câu 8.

### 13. The live LMS receives the Claude key from tracked infra
- In the personal-infra repo, the `lms` Vercel project gets `ANTHROPIC_API_KEY` as a sensitive variable for Production and Preview, created by Pulumi from the encrypted stack secret `lmsAnthropicApiKey`. Development is not a target because Vercel rejects sensitive variables there; local runs use the developer's own gitignored env file.
- The stack output does not include this value. The project's other env vars stay unmanaged.
- Commit `b859c7c` on `feat/lms-anthropic-key` adds `resources/lms-anthropic-key.ts`, calls it from `index.ts`, and adds the ciphertext to `Pulumi.prod.yaml`.
- Not yet done: push, PR, CI preview check, and the owner's check that Vercel has no hand-set `ANTHROPIC_API_KEY` before merging (a hand-set one would make the create fail after merge). The LMS change must not deploy before this merges.

## Key files

- `src/lib/ai/import-ai-client.ts`: provider setting, Claude/Gemini target, refusal re-read, 240 s budget, picture counts.
- `src/lib/ai/picture-markers.ts`: marker reader (`readPictureMarkers`).
- `src/lib/ai/question-import-prompt.ts`: import and re-read prompts (marker rules, current-pictures line).
- `src/lib/ai/ai-request-recorder.ts`: per-request span, log line, usage file, environment tag.
- `src/lib/ai/ai-call-telemetry.ts`: outcome, token and picture-count attributes on the import trace.
- `src/lib/ai/ai-usage-file.ts`: per-run totals from the usage file (used by the demo).
- `src/tests/setup.ts`, `src/tests/harden-ai-environment.ts`: Vitest no-real-AI guards.
- `src/mocks/e2e-ai-mock.ts`, `playwright.config.ts`: mocked e2e.
- `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/import-ai/unused-pictures.ui.tsx`: Unused pictures area and Add guard.
- `.../import-ai/question-preview.ui.tsx`: per-card picture warning, Remove, Retry, Import lock.
- `.../import-ai/import-ai-form.state.tsx`: busy/retry state, cancel retry.
- `.../import-ai/actions.ts`: parse action (takes picture numbers), empty-field messages.
- `.../tests/[testId]/question-media.schema.ts`: `MAX_MEDIA_PER_QUESTION = 3`.
- `e2e/import-ai-real.real-ai.ts`, `e2e/real-ai-env.ts`, `e2e/real-ai-read-timing.ts`: paid demo.
- `documents/adr/import-ai-provider-and-usage-records.md`: ADR.
- personal-infra: `resources/lms-anthropic-key.ts`, `index.ts`, `Pulumi.prod.yaml`.

## Known gaps and caveats

- The paid demo was run once (run `2026-10-24T17-23-17-366Z`): 3/3 checks passed on Claude Sonnet 5.5, one request, 70.4 s. Its read-time figure was wrong (0 s) because the save request also matched the parse route; fixed in code (`recordReadSeconds`), but the demo has not been re-run.
- Grafana verification of the demo's traces is blocked on the owner: no read-scoped token was available. The local usage file and server log confirm the records.
- Test-suite results and mutation results are recorded in `tmp/import-picture-reliability/` and are not repeated here.
- Behavior 13 is not live until its PR merges and the Vercel check is done.

## Decisions

Full reasoning is in `tmp/import-picture-reliability/DECISIONS.md`. Later decisions supersede earlier ones: D49 (no picture list), D75 (refusal re-read on Haiku, server fallback off), D93 (timeout outcome), D95 (lenient reply fields), D101 (counts from real picture numbers), D103 (Import locked during retry, cancel), D104 (SDK retries kept), D105 (key set in Pulumi by the agent, replaces D64).
