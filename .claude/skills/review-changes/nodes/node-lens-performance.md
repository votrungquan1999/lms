# Node: Performance Lens

Find performance regressions the diff introduces. Runs **only when holistic marked `performance: yes`** in its Lens Applicability block. Read `lens-common.md` for shared rules and `HOLISTIC.md` for framing.

**This lens reads beyond the diff — but only to establish magnitude.** Like the security lens, you may follow callers/callees/types/config (Read/Grep) to answer "is this path hot?" and "is `n` unbounded?". The finding must still concern code the diff introduced, changed, or newly exposed.

## Magnitude-first discipline (the core rule)

A performance finding is only real if it has **magnitude**: estimate both

- **`n`-scale** — is the data bounded/small, or unbounded/large?
- **path-heat** — per-request / per-render / per-item, or one-time / cold?

Anchor to the change: what did the path cost **before vs after** (the complexity delta)? Pre-existing slowness the change neither reaches nor multiplies is out of scope — but an existing cost the diff now pays per-request, per-item, or inside a new loop **is** in scope: file it as `pre-existing — newly reached` and let the before/after delta carry the finding. If you cannot construct a magnitude, it is a NIT — drop it. You cannot benchmark a diff, so when magnitude depends on runtime data you can't see, state the finding **conditionally** ("if `n` is large / this path is hot, then …") or mark `Needs verification: yes` on the magnitude assumption — never invent numbers.

## Focus

1. **Algorithmic complexity** — nested loops / repeated scans over unbounded `n`; accidental quadratics (`includes`/`find`/`in` inside a loop); `O(n²)+` where `O(n log n)`/`O(n)` suffices.
2. **Data access & I/O** — N+1 queries, per-item DB/network calls in a loop, missing batching/pagination, sync/blocking I/O on a hot path, work that blocks the event loop.
3. **Memory & allocation** — unbounded growth (caches/collections that never evict), large copies where a reference/view/stream would do, allocations in hot loops, leaks (uncleaned listeners/timers/subscriptions).
4. **Redundant / repeated work** — recomputation that could be hoisted or memoized, eager work that could be lazy, duplicate fetches, missing short-circuits.
5. **Frontend rendering** (if applicable) — unnecessary re-renders, unstable identities/deps, un-virtualized large lists, layout thrash, request waterfalls, heavy synchronous main-thread work, bundle-size regressions.
6. **Regression by removal** — the diff deletes or weakens an existing optimization (index, memo, cache, batch, `LIMIT`, pagination, virtualization).

## Severity (perf-tuned)

- **MUST FIX** — unbounded growth / OOM; timeout or DoS on realistic input; N+1 on a hot request/list-render path at real scale; blocking the event loop under load.
- **SHOULD FIX** — real but bounded degradation; avoidable extra queries/allocations on a warm path; missing batching where `n` is moderate.
- **NIT** — micro-optimizations / constant-factor tweaks with no magnitude behind them.

## What NOT to flag (on top of `lens-common`)

- Premature optimization on cold / one-time / startup / admin / build paths.
- Bounded-small `n` (a loop over a fixed small config).
- Patterns the runtime / DB planner / compiler already optimizes (JIT, hidden classes, C-builtins, query planner).
- Readability-costing micro-opts with no magnitude behind them.
- Caching/memoization that trades correctness (staleness) **without** naming that cost — if you suggest it, call out the correctness tradeoff; do not silently prescribe the faster-but-riskier path.

If a finding is attacker-triggerable (ReDoS, algorithmic-complexity DoS, unbounded request-driven allocation), flag the perf angle and note "also a security/DoS concern".

## Output

Write `./tmp/review-changes/LENS_performance.md` using the format in `lens-common.md`.
