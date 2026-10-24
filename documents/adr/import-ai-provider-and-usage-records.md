# ADR: Claude Reads Document Imports, and Every AI Request Is Recorded

**Date:** 2026-10-24
**Status:** Accepted, implemented
**Deciders:** Project Owner

Supersedes the provider choice in [import-questions-ai.md](import-questions-ai.md); the rest of that ADR (client-side extraction, review step, retry) stands.

## Context

Gemini misread document pictures often enough that teachers had to re-attach them by hand, and the owner could not see what any AI call cost or which key made it, least of all in test runs.

## Decision

### Claude Sonnet 5.5 reads imports; one setting switches back

- `AI_IMPORT_PROVIDER` is `claude` (default when unset or empty) or `gemini`; any other value fails the read with an error naming the setting.
- The Claude model is `claude-sonnet-5-5` unless `CLAUDE_MODEL_ID` overrides it. Reads get a 240 s limit and a 32K output cap, with no thinking or effort options.
- Grading stays on Gemini.

### Every provider request is recorded

- Each HTTP request to Gemini or Anthropic produces one `ai.provider.request` span, one `ai_request {...}` log line and, on local runs, one JSON line in `AI_USAGE_FILE` (default `tmp/ai-usage.jsonl`, never written on Vercel).
- A record holds provider, host, requested and served model, request id, status, outcome, attempt, duration, token counts, finish reason, environment, run id and the first 8 hex characters of the SHA-256 of the API key. It never holds the key, prompt or reply text.
- The AI SDK's retries each produce their own record.

### Test runs cannot reach a real provider

- Vitest forces fake AI keys, rejects every request to a provider host and sends records to a temp file.
- The mocked e2e server answers Gemini and Claude and rejects any other provider request; its records are tagged `e2e-mock`. Playwright always starts its own server.
