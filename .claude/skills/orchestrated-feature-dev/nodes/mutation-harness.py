"""Budgeted mutation harness — Phase 5c of orchestrated-feature-dev.

Injects one defect at a time, runs ONLY the tests covering the mutated file,
restores the file, and records whether the defect was killed.

    python3 mutation-harness.py MUTANTS.json RESULTS.json --repo DIR --test-cmd "CMD"

MUTANTS.json is a list of:
    {"name":  "B12 score tilt is ignored",
     "file":  "src/quant/engine/sizing.py",      # repo-relative, the mutated file
     "old":   "score_tilt_multiplier",           # must occur EXACTLY once in file
     "new":   "1.0",
     "tests": ["tests/engine/test_sizing.py"],   # REQUIRED — tests covering `file` ONLY
     "cmd":   "npx vitest run"}                  # optional, overrides --test-cmd

`tests` is mandatory and must stay narrow: a defect in `file` can only be killed by
tests that execute `file`. Passing the whole suite per mutant costs 10-20x and finds
nothing extra — a run that did this burned 62 minutes on 96 mutants.
"""

import argparse
import json
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


def run_tests(repo: Path, cmd: str, tests: list[str], timeout: int) -> tuple[bool, str]:
    """True if the suite passed. Non-zero exit = a defect was caught."""
    # A same-length mutation (2.5 -> 1.0, max -> min) keeps the file's mtime-second
    # and size, so CPython reuses a stale __pycache__ entry and the run silently
    # tests the wrong source. A fresh cache dir per invocation forces recompilation.
    with tempfile.TemporaryDirectory(prefix="mut-pycache-") as pycache:
        r = subprocess.run(
            shlex.split(cmd) + tests,
            cwd=repo, capture_output=True, text=True, timeout=timeout,
            env={**os.environ, "PYTHONPYCACHEPREFIX": pycache},
        )
    # Fall back to stderr — a missing runner says nothing on stdout, and a blank
    # "baseline is red" message is undiagnosable.
    lines = ((r.stdout or "").strip() or (r.stderr or "").strip()).splitlines()
    return r.returncode == 0, (lines[-1] if lines else "")[:200]


def run_mutant(repo: Path, m: dict, default_cmd: str, timeout: int) -> dict:
    path = repo / m["file"]
    original = path.read_text()

    # A mutant that lands in more than one place mutates code you did not intend.
    if original.count(m["old"]) != 1:
        return {"name": m["name"], "status": "APPLY-FAIL",
                "detail": f'`old` occurs {original.count(m["old"])}x in {m["file"]}'}

    try:
        path.write_text(original.replace(m["old"], m["new"]))
        passed, summary = run_tests(repo, m.get("cmd", default_cmd), m["tests"], timeout)
        return {"name": m["name"], "file": m["file"], "tests": m["tests"],
                "status": "SURVIVED" if passed else "KILLED", "summary": summary}
    except subprocess.TimeoutExpired:
        return {"name": m["name"], "status": "TIMEOUT", "detail": f"{timeout}s"}
    finally:
        path.write_text(original)
        # Never hand back a mutated tree — a leaked mutant corrupts every later step.
        if path.read_text() != original:
            sys.exit(f"FATAL: could not restore {m['file']} — fix by hand before continuing")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mutants"); ap.add_argument("results")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--test-cmd", required=True, help='e.g. "uv run pytest -q" — add -n auto / --pool=threads to parallelize within a mutant')
    ap.add_argument("--timeout", type=int, default=600)
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    mutants = json.loads(Path(args.mutants).read_text())

    missing = [m.get("name", "?") for m in mutants if not m.get("tests")]
    if missing:
        sys.exit(f"Every mutant needs a narrow `tests` list. Missing on: {missing}")

    # Without a green baseline every mutant reads as KILLED and the run proves nothing.
    baseline = sorted({t for m in mutants for t in m["tests"]})
    passed, summary = run_tests(repo, args.test_cmd, baseline, args.timeout)
    if not passed:
        sys.exit(f"Baseline is already red — fix it before mutating. {summary}")

    results = []
    for i, m in enumerate(mutants, 1):
        res = run_mutant(repo, m, args.test_cmd, args.timeout)
        results.append(res)
        print(f"[{i}/{len(mutants)}] {res['status']:9} {res['name']}", flush=True)

    Path(args.results).write_text(json.dumps(results, indent=2))
    survivors = [r for r in results if r["status"] == "SURVIVED"]
    counts = {s: sum(r["status"] == s for r in results)
              for s in ("KILLED", "SURVIVED", "APPLY-FAIL", "TIMEOUT")}
    print(f"\n{counts['KILLED']} killed / {counts['SURVIVED']} survived "
          f"/ {counts['APPLY-FAIL']} apply-fail / {counts['TIMEOUT']} timeout")
    for r in survivors:
        print(f"  SURVIVED: {r['name']}  ({r['file']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
