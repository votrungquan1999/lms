#!/usr/bin/env node
// Claude Code Stop hook: nudges when the task workspace holds records newer than the last
// mirror to the AI-Kanban card, so an interruption doesn't strand them in a folder the
// operator may delete. Reads the session pointer for the workspace path and the last-mirror
// timestamp — a hook is never told the workspace, so the agent leaves it in the pointer.
//
// workspacePath is the TASK/NOTES folder (the one holding IMPLEMENTATION_PROGRESS.md), matching
// the card field of the same name. It is neither cwd (a container of ~40 sibling repos) nor a
// code worktree — one task can span several repos while keeping a single set of notes, so this
// hook has no concept of repos at all.
// Always exits 0 — exit 2 on Stop would block the session from ending.

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// The three durable homes (D18). Decisions and transitions have dedicated files; the journal
// holds the types with nowhere else to go.
const TRACKED_FILES = [
  "DECISIONS.md",
  "IMPLEMENTATION_PROGRESS.md",
  "JOURNAL.md",
];

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

// Written by ai-kanban-track-session at card creation and re-stamped on each mirror.
function readPointer(sessionId) {
  if (!sessionId) return null;
  try {
    const path = join(
      homedir(),
      ".claude",
      "kanban-session-state",
      `${sessionId}.json`,
    );
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// Debt is satisfiable by design: mirroring re-stamps lastMirroredAt, which clears it. An
// unsatisfiable condition here would nudge forever, the way spec-reminder's git check did.
function findDebt(workspace, lastMirroredAt) {
  const mirroredMs = Date.parse(lastMirroredAt);
  if (Number.isNaN(mirroredMs)) return [];

  return TRACKED_FILES.filter((name) => {
    try {
      return statSync(join(workspace, name)).mtimeMs > mirroredMs;
    } catch {
      return false; // absent file is not debt — most workspaces never have all three
    }
  });
}

function buildNudge(debtFiles) {
  const list = debtFiles.join(", ");
  return (
    `Unmirrored work in your task workspace: ${list} changed since the last mirror to the card. ` +
    "Mirror the new entries now (append_decision / append_progress), then re-stamp lastMirroredAt in the session pointer."
  );
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "Stop",
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

  // additionalContext on Stop CONTINUES the conversation; nudging again on the Stop that
  // continuation produced would re-trigger this hook to the 8-continuation cap.
  if (input.stop_hook_active) {
    process.exit(0);
    return;
  }

  const pointer = readPointer(input.session_id);
  // Never guess: without a workspace or a mirror baseline there is no debt we can compute.
  if (
    !pointer ||
    typeof pointer.workspacePath !== "string" ||
    typeof pointer.lastMirroredAt !== "string"
  ) {
    process.exit(0);
    return;
  }

  const debtFiles = findDebt(pointer.workspacePath, pointer.lastMirroredAt);
  if (debtFiles.length === 0) {
    process.exit(0);
    return;
  }

  emit(buildNudge(debtFiles));
  process.exit(0);
}

// Belt-and-suspenders: an unexpected error must never crash the hook or exit non-zero
// (exit 2 on Stop blocks the session from ending).
main().catch(() => process.exit(0));
