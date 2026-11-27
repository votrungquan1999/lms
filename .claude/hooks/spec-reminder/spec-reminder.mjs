#!/usr/bin/env node
// Claude Code Stop hook: on a feature-dev session, nudges (never blocks) to update the living
// spec before wrapping up. Reads the hook JSON on stdin and a session-scoped sentinel the
// feature-dev skill drops at Phase 0; when the sentinel is present it emits an advisory
// additionalContext nudge. It deliberately does NOT inspect git — a git diff can't tell whether
// a spec-worthy behavior change happened, and comparing the sentinel's spec path against
// git-tracked changes produced unsatisfiable false positives whenever the spec lived outside the
// code's git repo (cross-repo / monorepo-root specs). Always exits 0 — exit 2 on Stop would block
// the session from ending.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

// Sentinel written by the feature-dev skill at Phase 0 (D7), naming the spec path this
// session is expected to touch. Absent = not a feature-dev session; stay silent.
function readSentinel(sessionId) {
  if (!sessionId) return null;
  try {
    const path = join(homedir(), ".claude", "spec-reminder-state", `${sessionId}.json`);
    const sentinel = JSON.parse(readFileSync(path, "utf8"));
    const hasRequiredFields =
      typeof sentinel.slug === "string" &&
      typeof sentinel.specPath === "string";
    return hasRequiredFields ? sentinel : null;
  } catch {
    return null;
  }
}

function buildNudge(specPath) {
  return (
    `This session is tracked against the living spec ${specPath}. ` +
    "If you changed feature behavior, update that spec before wrapping up."
  );
}

function emit(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext,
    },
  }));
}

async function main() {
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch {
    input = {};
  }

  // additionalContext on Stop CONTINUES the conversation, so nudging again on the Stop that
  // continuation produced would re-trigger this hook until Claude Code's 8-continuation cap.
  if (input.stop_hook_active) {
    process.exit(0);
    return;
  }

  const sentinel = readSentinel(input.session_id);
  if (!sentinel) {
    process.exit(0); // not a feature-dev session — stay silent
    return;
  }

  emit(buildNudge(sentinel.specPath));
  process.exit(0);
}

// Belt-and-suspenders: an unexpected error must never crash the hook or exit non-zero
// (exit 2 on Stop blocks the session from ending) — readSentinel already covers the known
// failure modes; this is the final backstop.
main().catch(() => process.exit(0));
