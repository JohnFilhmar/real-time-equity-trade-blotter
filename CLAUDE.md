# Project conventions

Repo: real-time equity trade blotter (TP ICAP take-home exercise).

These conventions override `~/.claude/CLAUDE.md` where they disagree. Everything the global file
says that is not restated here still applies, including `snake_case` naming, the ban on `any`,
and the sensitive-file rules.

## Prompt log

The brief asks for a file of **significant prompts** with **relevant responses, summarised**, and
says plainly: *"We are not interested in exhaustive logs; a representative sample is sufficient."*
Write the log to that standard, not to a transcript standard.

### The rule

**Each agent keeps one markdown file at `docs/prompt_log/<agent_slug>.md` recording the
significant prompts it received and, in one or two sentences, what came of each.**

- `main_session.md` for the primary agent. A subagent uses its own type in `snake_case`.
- Append-only, in the turn the work happened. Never batched at the end of the project, because a
  log assembled at the end reads as assembled at the end.
- Log a prompt when it **changed the architecture, produced or changed code or config, settled a
  trade-off, or corrected the direction of the work**.
- Skip status checks, "continue", formatting nits, clarifying questions that changed nothing, and
  anything the human marks as not to be logged.

### Entry format

```markdown
### <YYYY-MM-DDTHH:MMZ> - <snake_case_slug>

**Prompt:** "Verbatim. Blockquote it instead if it runs long."

**Outcome:** One or two sentences, past tense, plain language. What changed, and the decision if
one was made.

**Artifact:** [title](../artifacts/slug.html)   <!-- only when the escalation rule applies -->
**Commits:** `abc1234`                          <!-- only when code changed -->
```

- **The prompt is verbatim**, typos included. Truncate past ~2000 characters and mark the cut.
- **The outcome is one or two sentences.** No plan, no restatement of the prompt, no claim that
  outruns what was actually verified.
- **Timestamps are UTC.** Local time is UTC+8; convert it.
- **Never log a secret.** No `.env` contents, tokens, keys, or connection strings. Write
  `[REDACTED]` and name the class of value.

### When two sentences are not enough

If an honest answer needs evidence, a comparison, a diagram, a schema, or numbers, the responding
agent builds an artifact and links it. The outcome stays two sentences and points at the artifact.

Do not escalate for routine work whose result is visible in the diff.

**Artifacts are committed at `docs/artifacts/<snake_case_slug>.html`,** and the entry links that
relative path. The assessor receives a git repository and nothing else, so an entry linking only to
a published Artifact URL, which is private to the author's account, hands them a dead link.
Publishing as well is fine; link the in-repo path first.

### Subagents

The dispatcher passes this requirement in the dispatch prompt. If the subagent cannot write files,
the dispatcher writes the entry under the subagent's slug and marks it `(logged by dispatcher)`.

### Never

- Paraphrase or tidy a prompt. The assessor is reading the prompts that were really used.
- Edit or delete a past entry. Correct it by appending a new one.
- Write three sentences where the rule says two. That is the escalation rule firing: build the
  artifact instead.
- Log a prompt the human said not to log.
