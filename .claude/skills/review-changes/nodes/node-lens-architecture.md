# Node: Architecture Lens

Judge the **design decisions** in the change — first whether its premise is sound, then whether the structure around it fits. Read `lens-common.md` for shared rules and `HOLISTIC.md` for framing — including its `## Design Concerns to Investigate` list, which you own (see Hand-off below).

Quality owns micro-hygiene — naming, duplication, typing, comments. Do not restate it here. You own the decisions that are **expensive to reverse once merged**, and above all the one decision no amount of tidy structure can compensate for: whether the change is built on the right concept in the first place.

## You must read outside the diff

`lens-common.md` says review only the diff. **This lens is the exception** — "does this fit the system" is unanswerable from the diff alone, because the sibling routes, the existing table, and the layer above and below are all outside it. Read what you need: route tables and registries, the schema and migrations, the module the change sits in, callers on the far side of a contract.

The exemption is on what you **read**, not on what you **flag** — the fault must still belong to the change. Surrounding code is the frame of reference, never the target. "This existing module is poorly layered" is out of scope; "this change puts X in a layer that already owns Y" is in scope.

Because of that framing, your findings are almost always `Origin: introduced` — the diff's own design decision — even though the evidence cites unchanged code. Do not label one pre-existing merely because the comparison points sit outside the diff.

## Focus

**1. Modeling premise — is the right concept doing the job?** This is the deepest question in the lens and it outranks everything below it. The worst failure in a change is not a misplaced module; it is building on a concept that cannot bear the role it has been given. Structure cannot rescue a wrong premise: the layering can be clean, the route shape consistent, the types exact, and the design still wrong.

The method: ask what the design **requires to be true** of each thing it leans on, then check whether the chosen concept actually guarantees it.

> **Reference case — a nickname used as the URL alias.** A URL identifier requires stability (links get shared, bookmarked, and indexed), uniqueness, and safety in a path segment. A nickname is a *mutable display label*: the user can change it at will, it is not guaranteed unique, and it can collide with a reserved segment. It guarantees none of the three. The correct review is not "rename the param" or "add a uniqueness index" — it is **a display attribute must not carry identity**, so the design needs a real identifier (an immutable handle, or the id with the nickname as presentation only).

The same class, recurring:
- A **derived or computed value stored as the source of truth** — it will drift from what derives it.
- A **display or translated string used as a machine key** — it changes with copy edits and locale.
- A **natural key that isn't actually stable or unique** — email, phone, filename, external account name.
- **Booleans standing in for a state machine** (`is_active` + `is_deleted` + `is_archived`) — they permit states that must not exist.
- An identifier **scoped to one context used as if it were global** — unique per tenant, treated as unique everywhere.
- The **wrong entity owning the data** — a value that must be a point-in-time snapshot stored as a live reference, or the reverse.

When the premise is wrong, say so plainly and **lead the finding with it**. Do not soften it into the nearest mechanical fix — "add a unique constraint" accepts the wrong premise and entrenches it. Name the principle being violated, then say what the design should be built on instead.

**2. Scope — does the change reach further than the requirement?** Establish what the requirement actually demands, then check which layers the change touches. A presentation concern does not automatically become a system concern; an abstraction layer exists precisely to absorb it. *"Profile links should read `/profile/alice`"* is a frontend routing requirement — satisfied by the frontend route plus one lookup. It does not oblige the backend to stop keying on id. When a concern propagates outward through layers that never needed to know about it, **name the layer where it should have stopped.**

Symptoms: every layer of the stack changed for one user-visible string; an internal contract re-keyed to match a URL; a display format appearing in a column, a query, and a route at once.

Then ask the reversibility question, because the same decision costs wildly different amounts at different depths: as a lookup key, backing it out is dropping one endpoint and one column; as the routing identity, it is baked into every client that ever stored a URL. **When two placements both satisfy the requirement, the shallower one is right** — say so explicitly rather than treating depth as neutral.

**3. System fit** — is responsibility in the right layer/service/module? Does it duplicate a capability that already exists elsewhere? Does it cross a boundary the codebase otherwise keeps?

**4. Data model** — right table for this data? Are nullability, defaults, uniqueness, and indexing consistent with how it will actually be read and written? Who owns this identifier? Is a migration or backfill implied but absent?

**5. Contract design** — route/endpoint shape, request/response schema, event payloads, exported API, config keys. Is the new contract **consistent with its siblings** — does the same path segment, param, or field name mean the same thing everywhere it appears? Is it backward compatible, and what is the client migration path?

**6. Coupling & external dependencies** — what does this now depend on that it didn't before: another service, an infra change, a feature flag, or a manual out-of-repo step (a backfill, a migration run elsewhere, a config someone must set). **Anything the change needs that does not exist in this repo is a finding** — raise it and mark `Needs verification: yes` so a verifier can establish whether it actually exists yet.

**7. The alternative — design it, do not list it.** When you judge the approach wrong, you owe a **specific alternative**, not a menu. *"Pick one scheme and commit"* is not a review; it hands the decision back with the analysis undone. Give three things: the concrete shape (routes, columns, call flow), the cost it pays, and what it buys.

Then **name the best argument for the design you are criticizing, and answer it.** If the current approach takes one call and yours takes two, that round trip is a real regression and your alternative has to survive it — the version worth filing is usually the one that got there.

> **Reference case.** Against re-keying `/users/:userId/profile` to the alias, *"add a resolver endpoint"* is the weak form: it costs an extra round trip on the feature's most common page, which is the strongest argument the original design has. The strong form keeps the id route canonical and adds `/users/by-alias/:alias/profile` as a sibling on a **literal** segment — one call, the response carries the id for sibling calls, nothing has to guess whether `:x` is numeric, and because the id route survives, the rollout stops depending on a backfill in another repo. Same idea, and only the second version is worth the author's time.

"You could also have done X" is not a finding. A costed alternative that answers the obvious objection is.

## Failure mode: design consequence counts

`lens-common.md` requires a concrete runtime failure mode or an explicit "no distinct failure mode". This lens gets a **third accepted form — the design consequence**: what the change *forces later*. Use it when there is no runtime harm but a real future cost:

> `Design consequence: <what becomes true at merge> → <what it forces> → <who pays, and when>`

Reference bar for the level of detail: *"`/users/:userAlias/profile` ships alongside six `/users/:userId/*` routes → the segment after `/users/` no longer has one meaning, so every new handler and every client must decide per-route whether it holds an id or an alias → the next developer adding a `/users/:x` route picks the wrong one, and a numeric-looking alias resolves against the id lookup."*

This is a real failure mode, not the maintainability escape hatch — write it with the same specificity you would give a runtime trace. A design consequence that cannot name **what it forces** is not a finding; drop it.

**Reach for it only when there is genuinely no runtime harm.** A wrong modeling premise usually produces an ordinary runtime failure mode, and the concrete one is always the stronger finding — *"user edits their nickname → the alias in every shared, bookmarked, and search-indexed URL no longer resolves → visitors get a 404 on a link that worked yesterday, and the user has no way to know they broke it."* Write that, not a design consequence, whenever the chain exists.

**Severity.** A wrong premise is rarely a NIT. It is MUST FIX when it will corrupt or lose data, break live URLs or clients, or permit states the system must not have; SHOULD FIX when the cost is paid later in migration and confusion. Do not discount it because the code currently works — premise findings look harmless exactly until the mutable thing mutates.

## Before you finish: does one decision generate several of your findings?

Look back over everything you are about to file, plus the concerns in `HOLISTIC.md`. Ask whether a **single different design decision would dissolve several of them at once**. If one would, *that* is the finding — lead with it, and state explicitly which others it eliminates and why.

> In the alias review: the missing-fallback bug (numeric lookup deleted, no backfill in the other repo) and the broken single-resolver invariant were filed as two independent findings. They are one decision. Keeping `/users/:userId/profile` canonical and adding a `by-alias` sibling removes both — the fallback still exists, so the cross-repo deploy ordering evaporates, and the resolver keeps one meaning across all six sibling routes. Filed separately, they ask the author to patch two symptoms and leave the cause standing.

This is the observation **only this lens is positioned to make** — every other lens sees one column of the change and cannot tell that its finding shares a root with someone else's. Do not manufacture it; most changes have no such root, and a forced one is worse than none. But when the root is real it is the most valuable thing in the review, and it belongs at the top with the others named underneath it.

## Hand-off from holistic

`HOLISTIC.md` ends with `## Design Concerns to Investigate` — the open questions its approach evaluation raised. **You own that list.** For each entry, either turn it into a finding here, or record under `## Notes` why it isn't one (checked and fine, out of scope, owned by another lens). Leave nothing unaddressed — an unresolved concern sitting in `HOLISTIC.md` and reaching no report is the exact gap this lens exists to close.

## Output

Write `./tmp/review-changes/LENS_architecture.md` using the format in `lens-common.md`.
