# general_purpose

Research subagents dispatched by `main_session`. Four ran in parallel on 2026-09-12 to gather the
evidence behind [Blotter MVP Requirements](../artifacts/mvp_requirements_and_gap_analysis.html).

All four entries are marked `(logged by dispatcher)`: the subagents were worktree-isolated and their
shell tools refused every command, so none of them could read a UTC clock or write a file here. The
repository `CLAUDE.md` fallback puts the entry on the dispatcher in that case.

---

### 2026-09-12T01:57Z - research_blotter_domain (logged by dispatcher)

**Prompt**

> Deep web research task. You are researching the DOMAIN of an equity trade blotter for a
> broker/dealer front office, so a take-home exercise can be built to a credible standard by someone
> who is not a capital-markets specialist. [... truncated, ~3400 characters omitted: an eight-part
> brief covering what a blotter is, field rankings against FIX 4.4 tag numbers, the trade lifecycle
> and status model, notional and price conventions, settlement dates, timestamping and audit
> requirements, realistic reference data, and what an experienced markets engineer notices as wrong.]

**Outcome:** Established that a blotter is a regulatory record under 17 CFR 240.17a-3(a)(1) rather than a UI grid, so cancel must be a status and never a delete, and that the industry answer to amendment is cancel-and-correct on the wire over a versioned immutable record internally, which is what the build already does. Supplied the fourteen-item list of tells that mark seeded data as fake, two of which the seed generator currently trips.

---

### 2026-09-12T01:57Z - research_realtime_grid_ux (logged by dispatcher)

**Prompt**

> Deep web research task. Research UI/UX requirements for REAL-TIME FINANCIAL DATA GRIDS,
> specifically a trade blotter in a broker's front office, so a React/TypeScript implementation can
> be judged "thoughtful UX" by a trading-technology assessor. [... truncated, ~3300 characters
> omitted: a ten-part brief covering density and layout, flash and row-insertion behaviour,
> conflation, connection state, optimistic updates and conflict, colour semantics and accessibility,
> table interaction, tickets and fat-finger prevention, perceived latency, empty states, and
> responsive behaviour.]

**Outcome:** Produced forty-eight testable interface requirements from forty-three searches across AG Grid, W3C, Nielsen Norman Group, Bloomberg, Caplin and Carbon, including the measured flash timings most bank blotters use and the finding that conflation is a WCAG 2.3.1 control as much as a performance one. Established the compact row band of 24 to 32px, which the existing prototype already satisfies.

---

### 2026-09-12T01:57Z - research_realtime_server_architecture (logged by dispatcher)

**Prompt**

> Deep web research task. Research SERVER-SIDE requirements for a real-time trade-capture/blotter API
> in TypeScript (Node), at the level a trading-technology assessor would expect from a strong
> full-stack candidate. [... truncated, ~3200 characters omitted: an eleven-part brief covering
> transport choice, the resync problem, event payload design, concurrency, idempotency, API design,
> validation and domain rules, persistence, observability, security, and testing tiers.]

**Outcome:** Confirmed the existing decimal, timestamptz, version-column and audit-table choices as conventional, and identified the three real gaps: no sequence number on broadcasts so a client cannot detect a gap, offset pagination that re-serves and skips rows on a live-inserting blotter, and a CORS allowlist that does not cover WebSocket frames. Recommended refetch-on-reconnect with gap detection as the minimum credible resync, correct for any outage length and a handful of lines.

---

### 2026-09-12T01:57Z - research_takehome_grading_signals (logged by dispatcher)

**Prompt**

> Deep web research task. Research what actually scores well in a SENIOR FULL-STACK TAKE-HOME at a
> financial/trading technology firm, and specifically at interdealer brokers like TP ICAP, so a
> candidate can aim effort where the marks are. [... truncated, ~2800 characters omitted: the
> weighted rubric from the brief, the time budget, and an eight-part question set covering pass
> versus strong-hire signals per criterion, common ways candidates lose marks, TypeScript and testing
> expectations, README and AI-usage-report quality, scope strategy across the bonus list, how to
> write trade-offs, and TP ICAP specifics.]

**Outcome:** Ranked twenty-eight candidate work items by marks per hour against the weighted rubric, placing the two-client broadcast test at 9.5 and putting P&L last at 1 and authentication at 1.5, both of which the design work has already drawn. Confirmed that Engineering Quality, TypeScript and Full Stack Design are seventy percent of the mark and none of them is a feature count.

---

### 2026-09-12T07:05Z - build_positions_event_feed_and_price_precision

**Prompt**

> You are a backend subagent on a TypeScript trade blotter (Express 5, Prisma 7, Postgres, Socket.IO, zod 4, vitest 5). Work ONLY inside this git worktree and never cd out of it:
>
>   D:\My Folder\tp-icap-take-home-assessment\.claude\worktrees\submission
>
> THE STANDING RULE, verbatim from the repository owner: YOU DECIDE NOTHING. Every choice below has already been taken by the owner and is specified exactly. If you hit something this brief does not settle (a name, a shape, a threshold, a file location, an error message, a scope cut), do not pick one: finish everything that does not depend on it, then return the question with options, the cost of each, and your recommendation, and I will put it to the owner. "It was obvious" or "it was small" is not a reason to proceed.
>
> Ground rules (non-negotiable):
> - Do NOT commit, push, stash or switch branches. I review the diff and commit.
> - Do NOT touch README.md, database/README.md, docs/ai_usage_report.md, docker-compose.yaml, the frontend/ workspace, or any .env file. Never read, write, copy or delete .env, .env.*, keys or *.enc.
> - No `any`, no `as` to silence an error, no @ts-ignore. `unknown` and narrow. Explicit return types on exported functions. JSDoc on every exported symbol, in the style already used in backend/src (read a couple of files first). snake_case for files, functions and variables; camelCase on the wire and for Prisma fields, matching the existing code.
> - Match the existing patterns exactly: thin route handlers that parse a shared schema, call the service, answer; business rules in services/; persistence behind interfaces/trade_repository.ts with a Prisma implementation and an in-memory implementation used by tests; every inbound and outbound shape is one canonical zod schema in shared/src with types inferred by z.infer; no hand-written parallel types.
> - Tests: colocated <subject>.test.ts (unit and supertest) and <subject>.integration.test.ts (real Postgres). One case per branch that can produce a wrong answer. Do not test pass-through mappers.
>
> [... truncated, ~8,500 characters omitted: the file-size and shell-guard rules, the read-first list, the three specified changes (positions by symbol at GET /api/v1/positions, the global event feed at GET /api/v1/trades/events with keyset paging and a new index migration, and two-decimal rounding of live-feed prices), the verification commands to run and report verbatim, the by-hand check against the running API, and this prompt log obligation.]

**Outcome:** Added `GET /api/v1/positions` and `GET /api/v1/trades/events` with their shared schemas, both repository implementations, a keyset index migration and two-decimal rounding of live-feed prices; the unit tier went from 188 to 200 passing and the integration tier passed 35 against the compose Postgres, with both routes answering by hand from a local run of the changed code. The migration is written but not applied, because the permission classifier refused the deploy, and the frontend workspace typecheck fails inside in-progress UI work that imports nothing from this change.
