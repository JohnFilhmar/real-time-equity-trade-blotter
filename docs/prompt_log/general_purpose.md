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
