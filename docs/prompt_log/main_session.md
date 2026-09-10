# Prompt log - main session

**Agent slug:** `main_session`
**Role:** Primary interactive agent. Architecture, decisions, implementation, and dispatch of subagents.

Significant prompts only, append-only, newest at the bottom. Rules: `/CLAUDE.md`.

> These entries were backfilled at 2026-09-10T18:20Z, in the same turn the logging rule was
> introduced. Timestamps are approximate to within a few minutes, anchored to `git log`.

---

### 2026-09-10T17:35Z - review_skills_and_plan_approach

**Prompt**

> can you check skills tailored to me as my best practices, after that read carefully the markdown
> file take-home-assessment, then tell me what you think what should be the approach in executing
> and developing the app in fullstack starting from this bare frameworks i have setted up.

**Outcome:** Settled the up-front decisions, Postgres with `Decimal(18,6)` prices, Socket.IO as the sole transport, and a shared zod contract package, then laid out a seven-phase plan for a roughly 12 hour budget. Also found nine defects in the committed scaffold, two of which break the Docker image rather than merely degrading it.

**Artifact:** [Blotter Build Plan](../artifacts/blotter_build_plan.html)

---

### 2026-09-10T17:41Z - remove_direct_ws_dependency

**Prompt:** "uninstall the ws since it will conflict with socket.io and that's what the instruction explicitly expected to happen that should never happen as far as i remember when it comes to simple prompting or no-engineer prompts."

**Outcome:** Removed `ws` from the backend manifest and lockfile after confirming no source file imported it. There was no runtime conflict to fix, since `socket.io` pulls `ws` in transitively through `engine.io`, so the direct entry had only left the transport choice ambiguous in the manifest.

**Commits:** `e305abe`

---

### 2026-09-10T17:58Z - add_prompt_logging_rule

**Prompt**

> add a strict instruction for agent running in the scope of this project to follow through a
> markdown file for storing user prompts and 1 to 3 sentences narrowed response of the agent. each
> agent is a markdown file compiling the history of prompts and response. if the prompt or task is
> too complex or the response requires evidences or visualization that 1-3 sentences can discuss
> alone, a hyperlink to an artifact will be great showing what that prompt has really accomplished
> and achieved and that artifact should be made by the responding agent.

**Outcome:** Added the rule to a new root `CLAUDE.md`: significant prompts only, one append-only file per agent, a one to two sentence outcome, and an artifact whenever that is not enough. Artifacts are committed under `docs/artifacts/` rather than only published, because a published Artifact URL is private and the assessor receives nothing but this repository.

**Artifact:** [Blotter Build Plan](../artifacts/blotter_build_plan.html)

**Commits:** `f75d559`
