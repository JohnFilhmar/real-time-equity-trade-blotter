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

---

### 2026-09-12T12:19Z - split_repositories_and_trade_service_into_directories

**Prompt**

> You are a backend subagent on a TypeScript trade blotter (Express 5, Prisma 7, zod 4, vitest 5, ESM with nodenext module resolution, so every relative import ends in `.js`). Work ONLY inside this git worktree and never cd out of it:
>
>   D:\My Folder\tp-icap-take-home-assessment\.claude\worktrees\submission
>
> THE STANDING RULE, verbatim from the repository owner: YOU DECIDE NOTHING. This task is a pure mechanical refactor whose layout is specified exactly below. No behaviour changes, no renamed exports, no changed signatures, no changed JSDoc content, no new features, no "while I am here" cleanups. If anything below turns out to be impossible as written, stop that part, finish the rest, and return the question with options and a recommendation.
>
> Ground rules (non-negotiable):
> - Do NOT commit, push, stash or switch branches. I review the diff and commit.
> - Do NOT touch backend/src/lib/seed/** (another change is in flight there), README.md, docs/**, docker-compose.yaml, frontend/**, shared/**, or any .env file.
> - Use `git mv` for moves so history follows. Plain single shell commands only: the worktree guard refuses compound commands it cannot verify and heredocs containing backticks. Use the Read/Edit/Write tools for file contents.
> - Keep snake_case file names and the existing JSDoc on every exported symbol. Each new file gets a short JSDoc or comment at the top only where the file's purpose is not obvious from its name; do not narrate.
> - Match the existing code style exactly.
>
> THE TASK. Three files exceed the house limit of about 250 lines or 3 exported functions. Turn each into a directory as follows.
>
> [... truncated, ~4,500 characters omitted: the three directory layouts (prisma_trade_repository into index, query, reads and writes; in_memory_trade_repository into index, filtering, positions and events; trade_service into interfaces/trade_service.ts plus index and rules), moving the two colocated tests with them, the importer list to repoint under nodenext, the 250-line and three-export limit, the verification commands to run and report verbatim, and this prompt log obligation.]

**Outcome:** Split the three files into directories with `git mv` (`prisma_trade_repository/` with query, reads and writes; `in_memory_trade_repository/` with filtering, positions and events; `trade_service/` with rules, and the `TradeActor` and `TradeService` contracts moved to `interfaces/trade_service.ts`), moved the two colocated tests with them and repointed the nine importers, with every resulting file under 250 lines. Verified typecheck clean on all three workspaces, the unit tier at shared 30, backend 170 and frontend 38, and the integration tier at 35 passing against the compose Postgres; nothing committed.

---

### 2026-09-13T05:38Z - research_desk_readiness_gaps_and_ranking

**Prompt**

> You are a research subagent for a take-home trade blotter (React, TypeScript, Express, Socket.IO, Postgres). Your job is evidence gathering and ranking. You write no application code.
>
> THE STANDING RULE, verbatim from the repository owner: YOU DECIDE NOTHING. Any choice not already written down in the specs, the gap analysis, or the repo CLAUDE.md files stops and goes to the owner as an explicit question, with the options, the cost of each, and your recommendation. Ask before, not after. A subagent decides nothing either: you return findings and options to the dispatcher, who puts them to the owner. Do not implement anything.
>
> Repository (read only, do not modify anything except the one prompt-log file named at the end):
>   D:\My Folder\tp-icap-take-home-assessment\.claude\worktrees\hardening
>
> Read first, so your gap list is against what actually exists and does not re-derive settled things:
>   - take-home-assessment.md (what is graded: Engineering Quality 30%, TypeScript 20%, Full Stack Design 20%, UX 10%, Testing 10%, Communication 10%)
>   - docs/artifacts/mvp_requirements_and_gap_analysis.html (the FIX tag field set and the settled decisions; use its field list rather than re-deriving)
>   - docs/superpowers/specs/2026-09-12-interface-behaviour-design.md (what the interface already does: conflation, three connection states, keyboard, ARIA, seven table states)
>   - README.md and docs/api_reference.md (what shipped)
>   - frontend/src/components/blotter/columns.tsx (the columns the grid carries today)
>
> Then observe, not only read. Fetch and read these, they are live and need no licence:
>   - https://www.ag-grid.com/example-finance/  (a finance dashboard; note the columns, density, flash behaviour, what updates and how often)
>   - https://blog.ag-grid.com/streaming-updates-in-javascript-datagrids/  (how high-frequency updates are batched and rendered)
>   - https://blog.ag-grid.com/proof-trading-case-study/  (a trading firm describing what it wanted from a blotter)
>
> [... truncated, ~2,900 characters omitted: the instruction to treat Bloomberg AIM/TOMS, Fidessa, Charles River, FlexTrade and ION product pages as vocabulary rather than observed behaviour; the five focus areas (update behaviour under load, density and number formatting, trader keyboard use, feed-drop handling, columns a real blotter carries that this one does not); the deliverable, a ranked table of 10 to 15 candidate changes with evidence, hours, rubric movement and a cut line, plus a list of what the system already does; the constraints against reintroducing AMENDED, a cancellation reason, offset paging or a P&L with an invented mark, and against generic hour estimates; and this prompt log obligation.]

**Outcome:** Returned a fifteen-row table ranked by rubric movement per hour with a cut line after five items totalling about 3.6 hours (a tested pure sequence-gap rule, a debounce on the per-broadcast positions and event-feed refetch, a date on timestamps that are not today, a README line on the feed floor, and a Playwright feed-drop test), plus fourteen things the interface already does that the observed AG Grid finance demo, Proof Trading case study and FIX session practice do. Found that neither revision of the gap analysis carries a per-field FIX tag table, and that `settle_trade` refetches positions on every broadcast for every client, which the read limiter would turn into 429s at the feed's 250ms floor.

---

### 2026-09-13T06:21Z - broadcast_audit_positions_and_marks

**Prompt**

> You are a backend subagent on a TypeScript trade blotter (Express 5, Prisma 7, Postgres, Socket.IO, zod 4, vitest 5, ESM nodenext so relative imports end in `.js`). Work ONLY inside this git worktree and never cd out of it:
>
>   D:\My Folder\tp-icap-take-home-assessment\.claude\worktrees\hardening
>
> THE STANDING RULE, verbatim from the repository owner: YOU DECIDE NOTHING. Every choice below has been taken by the owner and is specified exactly. If you hit something this brief does not settle, do not pick: finish everything that does not depend on it, then return the question with options, the cost of each, and your recommendation. "It was obvious" or "it was small" are not reasons to proceed.
>
> Ground rules (non-negotiable):
> - Do NOT commit, push, stash or switch branches. I review the diff and commit.
> - Do NOT touch frontend/**, shared/** (the contract is finished and committed; read it, do not change it), README.md, docs/** except the one prompt-log file named at the end, docker-compose.yaml, Dockerfiles, package.json files, or any .env file. Another agent is moving backend/prisma into a database/ workspace in a separate worktree; do not touch backend/prisma or prisma.config.ts here either.
> - No `any`, no `as` to silence an error, no @ts-ignore. `unknown` and narrow. Explicit return types on exported functions. JSDoc on every export in the style of the existing files. snake_case files and identifiers; camelCase on the wire. Files under about 250 lines and about 3 exported functions; split into a directory if needed, following how repositories/prisma_trade_repository/ is laid out.
> - The shell guard refuses compound commands it cannot verify and heredocs containing backticks. Plain single commands; Write/Edit tools for files.
> - Tests colocated as <subject>.test.ts and <subject>.integration.test.ts. One case per branch that can produce a wrong answer.
>
> [... truncated, ~8,400 characters omitted: the read-first list; the contract already in shared/ (three new event names, the audit, position and mark payloads, the extended Position and the exported position walk); the five specified changes (three broadcaster methods on one sequence, RecordedWrite from amend and cancel, positions from the shared walk over find_active_trades with position_for and the trade-then-event-then-position broadcast order on every write, the mark store and 900ms mark feed with the prototype's drift constants and their index.ts and socket-server wiring, and the test list per file); the verification commands to run and report verbatim; and this prompt log obligation.]

**Outcome:** Built the three broadcaster methods on the one sequence, `RecordedWrite` from amend and cancel in both repositories, positions from the shared walk over `find_active_trades` with `position_for` and the trade, audit, position broadcast order on every write, and the in-process mark store and 900ms mark feed sent to each client on connect and after every tick, with the SQL aggregate and its mapper deleted. Verified typecheck clean on all three workspaces, the unit tier at shared 39, backend 184 and frontend 43, and the integration tier at 38 against the compose Postgres; nothing committed.
### 2026-09-13T06:39Z - restructure_database_into_its_own_workspace

**Prompt**

> You are a subagent restructuring the database deliverable of a TypeScript trade blotter monorepo (npm workspaces: shared/, backend/, frontend/; Express 5, Prisma 7 with driver adapter, Postgres 17, Redis, Docker Compose). You work in your own isolated git worktree that the harness created for you; run `git status` and `git branch --show-current` first and report them. Never cd outside it.
>
> THE STANDING RULE, verbatim from the repository owner: YOU DECIDE NOTHING. Every choice below has been taken by the owner and is specified exactly. If you hit something this brief does not settle, do not pick: finish everything that does not depend on it, then return the question with options, cost of each, and your recommendation. "It was obvious" or "it was small" are not reasons to proceed.
>
> Ground rules (non-negotiable):
> - Never read, write, move, copy or delete .env, .env.*, keys or *.enc. Do not create a .env.example either; the owner creates it himself.
> - No AI attribution in any commit. snake_case files and identifiers; match the existing code style; JSDoc on exported symbols; comments only where the reason is not obvious.
> - The shell guard refuses compound commands it cannot verify and heredocs with backticks. Plain single commands; Write/Edit tools for file contents; `git mv` for moves.
> - Do not touch: frontend/src/**, backend/src/** except the two files named below, shared/**, docs/prompt_log/main_session.md, docs/artifacts/**. Do not edit README.md beyond the pointer changes named below.
> - Commit on your branch in logical steps when the verification below passes. Do not push. Do not merge. Report the branch name and the commit hashes.
>
> Setup, a fresh worktree needs: `npm install`, `npm run build:shared`, and the Prisma client generated (after your move, via the new database workspace).
>
> THE TARGET, decided by the owner ("option C"): the database is its own unit. `database/` owns the Postgres container definition, the Prisma schema, the migrations, the migration runner image and the documentation. `backend/` keeps the generated client, the seed code and the application, and needs only `DATABASE_URL` to reach the database. The single source of database configuration is `database/` plus one root `.env` for local runs.
>
> [... truncated, ~7,300 characters omitted: the five numbered sections specifying the new `@blotter/database` workspace (its package, the `git mv` of the schema, migrations and `prisma.config.ts`, the migration-runner and Postgres Dockerfiles, `database/compose.yaml` and the root `include:`), the backend changes limited to `package.json`, `src/config/env.ts` and the Dockerfile, the root scripts and CI, the approved outline of `database/README.md`, the root README pointer changes, the verification list to run and report verbatim, and this prompt log obligation.]

**Outcome:** Moved the Prisma schema, migrations and config into a new `@blotter/database` workspace with its own Postgres image, migration-runner image and included compose file, repointed the backend, the root scripts, CI and the Dockerfiles at it, and rewrote `database/README.md` around the entity diagram, the trigger, the migrations and the seed. Verified typecheck clean, the unit tier at shared 30, backend 170 and frontend 38, the integration tier at 35, `db:status` reporting no pending migrations, and a clean compose project on alternate ports in which `migrate` exited 0 after applying all four migrations and the API answered 200 on `/ready`.

**Commits:** `d56b118`, `e38295b`
