# AI grading through the background Claude runner

AI grading (Auto-grade, Regenerate all, Regenerate one question) can run as a job on the owner's background Claude runner instead of on Gemini. The teacher is told grading has started, and the suggestions appear on the grading page when the job finishes. Without runner settings the three triggers grade on Gemini on the spot, exactly as before.

## Behaviors

- **A click starts a job and returns at once.** The teacher sees "AI grading started" instead of waiting for the result. The job carries the same prompt Gemini would have received, and the runner uses Sonnet.
- **One job per submission at a time.** While a job is pending for a student's submission, all three triggers are disabled and refused, including Regenerate one question. A stale Auto-grade click gets "AI grading is already in progress for this submission." even when suggestions from an earlier round exist, because the pending-job check comes before the "suggestions already exist" check. The database enforces it with a partial unique index on test and student where the job is pending. A double-click that slips past the check wastes one paid runner job and shows "AI grading failed. Please try again.", never two pending jobs.
- **The submission shows "AI grading in progress since <time>"** for as long as its latest job is pending, whatever the submission's status. A student who leaves `Submitted` while a job is pending (for example because the teacher hand-graded every answer) keeps the note, the 10 second self-refresh and the disabled per-question Regenerate, and the result still lands. Practice tests never get an AI job, so they show none of this. A render that loses the claim to another tab counts as still in progress for that render, so the page refreshes once more and the winner's rows appear without a manual reload.
- **The grading page collects the result itself.** There is no reply address (no webhook). Whenever the student's grading page renders, the LMS asks the runner for each pending job's status, and once the job has ended it reads the full job and saves the suggestions. A small client timer calls `router.refresh()` every 10 seconds while the page shows the in-progress note, so a teacher watching the page sees the suggestions arrive. The refresh keeps typed drafts and open dialogs. A background tab slows the timer to about once a minute, and a job that never starts keeps an open tab refreshing. The by-question view has no AI controls, so nothing is collected there.
- **A finished job saves a new round once.** Suggestions are labelled `model: claude-sonnet` and `gradedBy: ai:claude-sonnet`, so the panel shows a stable name. Two tabs, or a reload racing the self-refresh, save the round once: the job row is claimed atomically from pending to its final state first, and only the winner writes the suggestion rows.
- **A suggestion for a question the teacher graded meanwhile is kept** and shown with its timestamp. It never changes the teacher's grade.
- **A failed or unusable job tells the teacher and allows a retry.** A job the runner reports as `failed` or `cancelled`, a `succeeded` job whose text does not parse or misses a requested question (`bad_result`), and a job the runner no longer knows (`not_found`) all end as failed. The grading page shows "The last AI grading attempt did not finish. You can try again." whenever the latest job has failed, whatever the submission's status. The note clears when a new AI round starts: a job row (the new job is pending) or, for a round that goes through Gemini and leaves no job row, suggestions newer than the failed job.
- **The "AI grading started" message does not outlive its job.** The AI triggers and the suggestion panels are keyed by the latest job's id and status, so the green confirmation from a click is dropped when the page shows the in-progress note or the failure note.
- **An unreachable runner never breaks the page during a check.** A network error, a timeout (5 seconds) that covers the whole answer including the body (a runner that sends headers and then stalls counts as unreachable), any answer other than 200 or 404 (a 401 or 403 is recorded as refused, with its status), an unreadable body or unusable runner settings leave the job pending, and the next render checks again.
- **The runner cannot be reached when starting: Gemini grades on the spot.** A network error, a timeout (15 seconds, covering the whole answer including the body) or a 5xx on the create request falls back to Gemini with the same snapshot, no job row, and the usual "AI suggestions generated". The teacher can wait up to 15 seconds before the fallback answers.
- **The runner refuses the job: "AI grading failed", no Gemini.** See the create-answer table below.
- **The owner can reconstruct any job's history days later.** See "Runner visibility".

## Create answers

Only a readable 201 creates a job. The create request uses `redirect: "manual"`, so a redirect is a status and never followed.

- **201 with a body holding the 24-hex job id** — job created, row inserted, suggestions arrive later.
- **Network error, timeout (including a body that stalls after the headers), any 5xx** — unreachable; Gemini grades on the spot.
- **Any other 4xx (400, 401, 403, 404, 405, 408, 413, 429 and the rest)** — refused; "AI grading failed. Please try again.", no Gemini call, no job row, no suggestion rows, so a retry is allowed at once.
- **Any 3xx, or a 2xx other than 201** — refused, same as above.
- **201 whose body cannot be read** — refused; the only refusal recorded with status 201. The runner has the job, so grading on Gemini as well would double-grade.
- **Unusable runner settings (a `BCR_URL` that is not an https URL)** — "AI grading failed", no Gemini.

What each refusal usually means, from the runner: 401 unknown or revoked key; 403 key of the wrong kind; 400 request shape rejected; 404 wrong `BCR_URL` path; 413 body over the runner's size limit; 429 the key already has 20 queued jobs. The teacher sees the same pinned message for all of them. A full queue shows it on every click until jobs drain; the owner sees the status in the trace.

Orphan-job caveat: a timeout or 5xx after the runner already stored the job is treated as unreachable. Gemini grades, and the runner job is paid for and never collected.

## Runner contract

- `POST {BCR_URL}/api/jobs` with `Authorization: Bearer <service key>` and body `{prompt, options: {model: "sonnet"}}`. No `callbackUrl`. A 201 answers `{id, status}`.
- `GET {BCR_URL}/api/jobs/:id?view=status` for each check; returns the status only.
- `GET {BCR_URL}/api/jobs/:id` once the status is `succeeded`, `failed` or `cancelled`; returns the result text or the error kind.
- A job created under one service key answers 404 to another key.

## Settings

- **`BCR_SERVICE_KEY`** switches the feature on. Without it every trigger grades on Gemini and the runner is never contacted (local development, tests, previews).
- **`BCR_URL`** must be an https URL once the key is set. A bad value fails a start with "AI grading failed" and is skipped during a check; a key removed while a job is pending leaves the job pending ("in progress").
- Settings are read per call, never when the service is built, so a bad value cannot break every grading page.
- **Where they live.** Vercel production only, set by personal-infra `resources/lms-claude-runner.ts`; the key is the encrypted stack secret `lmsRunnerServiceKey`. Preview deployments get neither variable, so they grade on Gemini. A local run uses the runner only when both are set in a gitignored env file, as the show-me script does.
- **Creating the key.** Create a service key on the runner's `/tokens` page and put it in the Pulumi secret and in the local show-me env file.
- **Rotating the key.** Put the new key in Pulumi and redeploy, then revoke the old one on the runner. Jobs created under the old key answer 404 to the new key and end as `not_found`, so rotate when nothing is pending.

## Reading a job's state

- **`queued` with `waitReason: usage_limit`**, or **`running` with `runner_lost`**, look like "in progress" to the LMS. Only the full job read on the runner shows why.
- **A job that never starts** keeps blocking AI grading for that submission. There is no "start anyway" control; unblock it on the runner side.
- **Crash windows.** The job is claimed before the suggestion rows are written. A crash or insert failure after the claim leaves the job `succeeded` with no suggestions; the teacher regenerates.
- **Error kinds on a failed job** (`errorKind` on the row, `lms.ai.runner.error_kind` on the span). From the runner: `claude_error`, `timeout`, `crashed`, `usage_limit`, `runner_lost`, `result_too_large`, `unexpected_environment`, `invalid_files`. From the LMS: `bad_result` (the text did not parse or missed a requested question), `not_found` (the runner has no such job for this key), `cancelled`, and `unknown` (a `failed` job whose runner record carries no error). The runner's error message is kept on the row only, truncated, because it may quote the prompt or the answer.

## Runner visibility

Every exchange with the runner is one record written to three places. Records hold only enums, ids, counts, status numbers and error names, never keys, prompts, answers, URLs or error messages.

- **Trace spans.** The `aiGrade.startRound` span carries the create outcome (`created`, `unreachable`, `refused`, `settings_error`), the runner job id, the refused status and the unreachable cause, recorded before any fallback, throw or row insert. Each status check is recorded on the `aiGrade.collectRunnerResult` span: the runner status seen, what the LMS did, the saved count (the rows actually written, one per requested question; extra graded ids in the result are never saved) or error kind, and for a saved round the token usage, cost and model ids. Attributes live under `lms.ai.runner.*` and `lms.ai.runner_job_id`.
- **`ai_runner {json}` log line.** snake_case, like the existing `ai_request` line. Vercel keeps runtime logs about an hour.
- **The job row's `events` history** (`ai_grade_job.events`). The create entry is written with the row. A check adds an entry only when the runner status it saw differs from the last one recorded (unreachable counts as a status) and on the check that ends the job. The history is bounded to the last 50 entries.

To read a job's history days later: search the traces in Grafana by `lms.ai.runner_job_id`, or open the job's `events` in Atlas. Traces are kept about 14 days; the row's history is permanent.

## Show-me script

`pnpm test:e2e:real-runner` drives the real runner from the owner's machine. It is a demo, never part of `pnpm test` or `pnpm test:e2e`, and each run pays for one Sonnet job.

- **Setup.** Create the gitignored `.env.e2e-real-runner.local` with `BCR_URL` and `BCR_SERVICE_KEY`. The runner machine must be on, and nothing else may use port 3006.
- **What it does.** It boots its own dev server, seeds a course, student, test, answer and submission into `lms_e2e_real_runner`, clicks "Auto-grade with AI", and waits for the suggestions through the page's own refresh.
- **Output.** `tmp/real-ai-runs/<run-id>-runner.json` holds the job row with its events, the runner's full job (status, result text, usage with cost) and the saved suggestions, written before any assertion. A screenshot of the panel is saved with it.
- **If the suggestions never land.** The run file's job row `events` and the runner job's `status`, `error` and `waitReason` say which side stopped.
- **Last real run.** 2026-11-24, runner at `bba44c8` (the first runner version that starts Claude Code 2.1.327 with `--verbose`): queued, running, succeeded, one `claude-sonnet` suggestion shown about 22 s after the click; one Sonnet job, 0.011 USD.

## Key files

- `src/lib/ai/background-claude-runner-client.ts` — create, status and job reads; the typed outcomes; `RunnerRefusedError`
- `src/lib/ai/runner-settings.ts` — per-call settings resolution; `RunnerSettingsError`
- `src/lib/ai/runner-event.ts` — the runner event record: span attributes and the `ai_runner` log line
- `src/lib/ai/runner-grading-prompt.ts`, `src/lib/ai/runner-grading-result.ts` — the prompt and the result parser
- `src/lib/ai-grade-service.ts` — `startRound` and `collectRunnerResult`
- `src/lib/ai-grade-job-service.ts` — the job row, claim and history
- `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grade-actions.ts` — the three triggers and the pinned failure message
- `e2e/ai-grading-runner.real-runner.ts`, `playwright.real-runner.config.ts` — the show-me script

## Tests

- `src/lib/ai/__tests__/background-claude-runner-client.test.ts`
- `src/lib/ai/__tests__/runner-event.test.ts`
- `src/lib/__tests__/ai-grade-service-collect-runner.test.ts`
- `src/lib/__tests__/ai-grade-job-service.test.ts`
- `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/__tests__/ai-grade-actions-runner.test.ts`
- `src/app/admin/(dashboard)/grading/__tests__/grading-page-ai-grading-result.test.tsx`
- `src/app/admin/(dashboard)/grading/__tests__/grading-page-ai-grading-in-progress.test.tsx`

Branch: `feat/ai-regenerate-graded`.
