#!/usr/bin/env node
// Claude Code UserPromptSubmit hook for AI-Kanban tracking. Reads the hook JSON on
// stdin and injects a card-status + record-keeping reminder via additionalContext —
// the agent does the recording, in its own words, not this hook mechanically.
// Always exits 0 — exit 2 would erase the user's prompt.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Asked retrospectively and re-asked every prompt, because at prompt time the size of the work is
// least knowable — the cheap error is opening a card late, never opening one for finished work.
// Search-first too: a session with no pointer is usually a resumed one (compact, restart), and the
// repo tag is the only rung that finds the OPEN card this work belongs under rather than its twin.
const NO_POINTER_REMINDER =
  "No AI-Kanban card is active for this session. Open one only if you would want to revisit this work a week from now — judge that from what the work has already produced, not from what it might become. If you would, check the board before creating: the same task by keyword, and the open cards tagged with this repo, which is where a card covering this usually already sits.";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

// Pointer written by the model right after create_card; absent = no active card.
function readPointer(sessionId) {
  if (!sessionId) return null;
  try {
    const path = join(
      homedir(),
      ".claude",
      "kanban-session-state",
      `${sessionId}.json`,
    );
    const pointer = JSON.parse(readFileSync(path, "utf8"));
    const hasRequiredFields =
      typeof pointer.cardId === "string" &&
      typeof pointer.cardNumber === "number" &&
      typeof pointer.summary === "string";
    return hasRequiredFields ? pointer : null;
  } catch {
    return null;
  }
}

// Fires on every prompt, so the record-keeping ask must be conditional — only when something
// notable actually happened — or it just trades verbatim noise for agent-generated noise. The
// hook only knows session_id/cwd, never the task workspace path, so instructions refer to "your
// task workspace" generically rather than interpolating or inventing an absolute path.
//
// D18/D19 routing: each entry type has exactly one home, never the journal for the two that
// already have a dedicated file/tool — decisions and transitions would otherwise be recorded twice.
function buildReminder(pointer) {
  if (!pointer) return NO_POINTER_REMINDER;
  return (
    `Active AI-Kanban card #${pointer.cardNumber} (${pointer.summary}). ` +
    "If something notable just happened, record it in your task workspace: a decision (with why) -> " +
    "append_decision + DECISIONS.md; a step finishing/starting -> IMPLEMENTATION_PROGRESS.md; an open " +
    "question, a finding, or a reusable command -> JOURNAL.md (append). Diverged into a distinct task? " +
    "create_card with forceNew:true."
  );
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    }),
  );
}

async function main() {
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch {
    input = {};
  }

  const pointer = readPointer(input.session_id);
  emit(buildReminder(pointer));
  process.exit(0);
}

// Belt-and-suspenders: an unexpected error must never crash the hook or exit non-zero
// (exit 2 erases the user's prompt) — per-function try/catches already cover the known
// failure modes; this is the final backstop.
main().catch(() => process.exit(0));
