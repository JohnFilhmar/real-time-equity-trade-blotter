# Prompt log

The **Prompt Log** deliverable from the take-home brief: the significant prompts given to AI agents
during development, each with a one to two sentence summary of what came of it.

This is a representative sample, not a transcript. Prompts that changed the architecture, produced
or changed code, settled a trade-off, or corrected the direction of the work are here. Status
checks and clarifying questions are not.

One file per agent, appended as the work happens. The rule that governs it is in the repository
root `CLAUDE.md`.

## Agents

| File | Agent | Role |
|---|---|---|
| [`main_session.md`](main_session.md) | `main_session` | Primary interactive agent: architecture, decisions, implementation, subagent dispatch |
| [`design_session.md`](design_session.md) | `design_session` | Background design agent: visual directions, design tokens, interaction and loading specifications |

`template.md` is the entry template, not a log.

## Reading it

Entries run oldest first, timestamped in UTC. Prompts are verbatim, including typos, because the
brief asks for the prompts that were actually used rather than a tidied version of them.

Where two sentences could not carry the answer honestly, the entry links an artifact under
[`../artifacts/`](../artifacts/) built by the agent that answered. Those artifacts are committed
here, so they open from a clone with no account or network access needed.

The **AI Usage Report**, also required by the brief, is assembled from this log at the end of the
project and lives at `docs/ai_usage_report.md`.
