# Project conventions

Repo: real-time equity trade blotter (TP ICAP take-home exercise).

These conventions override `~/.claude/CLAUDE.md` where they disagree. Everything the global file
says that is not restated here still applies, including `snake_case` naming, the ban on `any`,
and the sensitive-file rules.

## Prompt logging is mandatory

The assessment grades a **Prompt Log** and an **AI Usage Report** under Communication (10%).
Those documents are built from this log. A log reconstructed at the end of the project reads as
reconstructed, so it is written as the work happens, never afterwards.

### The rule

**Every agent that acts in this repository keeps exactly one markdown file recording every prompt
it received and what it did about it.**

- Path: `docs/prompt_log/<agent_slug>.md`. One file per agent, appended forever.
- The primary interactive agent uses `main_session.md`. A subagent uses its own type as the slug
  in `snake_case`: `explore.md`, `general_purpose.md`, `cavecrew_investigator.md`, `plan.md`.
- The entry is appended **before the turn ends**, in the same turn the work happened. Never
  batched at the end of a session, never deferred to "later".
- Entries are append-only. A past entry is never edited or deleted. A mistake is corrected by
  appending a new entry that says what was wrong.
- A new agent file requires a new row in `docs/prompt_log/index.md` in the same commit.

### Entry format

Copy `docs/prompt_log/template.md`. The shape is fixed:

```markdown
### <ISO-8601 UTC timestamp> — <snake_case_slug>

**Prompt**

> Verbatim. Not paraphrased. Not cleaned up.

**Response** — 1 to 3 sentences, past tense, stating the outcome rather than the intention.

**Artifact** — [title](../artifacts/slug.html)  <!-- only when the escalation rule applies -->
**Commits** — `<short sha>`, `<short sha>`      <!-- only when code changed -->
```

Rules for the fields:

- **Prompt is verbatim.** Quote what was actually said, including typos. If it exceeds ~2000
  characters, truncate and mark the cut with `[... truncated, N characters omitted]`.
- **Response is 1 to 3 sentences.** State what was produced, decided, or changed. Not a plan, not
  a restatement of the prompt, and not a claim that outruns what was verified.
- **Timestamps are UTC**, `YYYY-MM-DDTHH:MMZ`. Local time is UTC+8; convert, do not paste it raw.
- **Never log a secret.** No `.env` contents, tokens, keys, connection strings, or credentials,
  even if the prompt contained one. Replace with `[REDACTED]` and note what class of value it was.

### When 3 sentences are not enough - the escalation rule

If an honest answer needs evidence, a comparison, a diagram, a table, benchmark numbers, a
before/after, or a walkthrough, then **the responding agent publishes an artifact and links it**.
The summary stays 1 to 3 sentences and points at the artifact for the rest.

Escalate when any of these is true:

| Trigger | Example |
|---|---|
| The answer rests on evidence a reader cannot see | test output, query plans, timing numbers |
| Something must be compared | two architectures, before/after a refactor |
| The output is structural | schema, ERD, sequence of events, directory layout |
| A decision was made with real trade-offs | transport choice, database choice |
| A reader would otherwise take the claim on trust | "the broadcast reaches every connected client" |

Do **not** escalate for routine work whose result is fully visible in the diff.

The artifact is authored by the agent that answered, not delegated to another agent and not left
for the human.

**Every artifact must exist in the repository at `docs/artifacts/<snake_case_slug>.html` (or
`.md`), and the log entry must link that relative path.** The assessor receives a git repository,
nothing else. A published Artifact URL is private to the author's account, so a log that links only
to one hands the assessor a dead link and loses the marks the log was written to earn.

Publishing the same page as an Artifact as well is encouraged, because it renders diagrams and
tables the author can check quickly. When both exist, link the in-repo path first and the published
URL second, labelled as such.

An artifact link that 404s is worse than no artifact. Verify the link before the entry is committed.

### Subagents

The dispatching agent is accountable for its subagents' entries:

- The dispatch prompt must carry this requirement explicitly, including the subagent's slug.
- If the subagent cannot write files, **the dispatcher writes the entry under the subagent's slug**
  and marks it `(logged by dispatcher)`.
- A subagent's prompt for logging purposes is the task text it was given, not the human's original
  wording.

### Red flags

These thoughts mean the rule is about to be broken:

| Thought | Reality |
|---|---|
| "I'll write the log entries at the end" | The log is written as the work happens. That is its whole value. |
| "This prompt was trivial" | Every prompt gets an entry. Triviality is what the 1-sentence limit is for. |
| "I'll paraphrase the prompt more clearly" | Verbatim. The reviewer is assessing the real prompts. |
| "The explanation needs a paragraph or two" | That is the escalation rule firing. Publish an artifact. |
| "Someone else can make the artifact" | The agent that answered makes it. |
| "I'll fix that earlier entry" | Append-only. Correct it with a new entry. |
| "It was only a question, not a task" | Questions are prompts. They get entries. |
