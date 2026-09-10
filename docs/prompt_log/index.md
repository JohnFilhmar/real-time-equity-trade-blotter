# Prompt log

This directory is the **Prompt Log** deliverable named in the take-home brief. It records every
prompt given to an AI agent during development, alongside a one to three sentence summary of what
that agent actually did about it.

One file per agent, appended as the work happens. The rule that governs it, including the entry
format and the escalation rule for prompts too involved to summarise in three sentences, is in the
repository root `CLAUDE.md`.

## Agents

| File | Agent | Role |
|---|---|---|
| [`main_session.md`](main_session.md) | `main_session` | Primary interactive agent: architecture, decisions, implementation, subagent dispatch |

`template.md` is the entry template, not a log.

## Reading it

Entries are chronological, oldest first, timestamped in UTC. Prompts are verbatim, including
typos, because the brief asks for the prompts that were actually used rather than a tidied version
of them.

Where a one to three sentence summary could not carry the answer honestly, the entry links an
artifact under [`../artifacts/`](../artifacts/) built by the agent that answered. Those artifacts
are committed to this repository so they open from a clone, with no account or network access
needed.

The **AI Usage Report**, also required by the brief, is assembled from this log at the end of the
project and lives at `docs/ai_usage_report.md`.
