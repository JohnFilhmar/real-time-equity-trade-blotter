# AI usage report

## Tools used

**Claude Code (Opus 5)** was the only AI tool used, run from the terminal with direct access to the
repository, the shell, Docker, and the project's own convention files.

Two capabilities mattered more than the model itself:

- **Documentation lookup (Context7).** Used to read the current Prisma 7 documentation rather than
  rely on recalled API shapes. This caught four breaking changes in one pass; see below.
- **Real command execution.** Every claim in this repository about something building, passing or
  running was produced by running it, not by inference.

## How it was used

Work ran in git worktrees, one per unit of work, merged to `master` only after typecheck and tests
passed. Each phase followed the same loop: read the brief and the existing code, state the
decisions and their rejected alternatives, implement, verify by running, then record the outcome.

A project rule in [`CLAUDE.md`](../CLAUDE.md) requires every agent working in this repository to
log its significant prompts as the work happens rather than reconstructing them afterwards. The
result is [`docs/prompt_log/`](prompt_log/index.md), which is the raw material for this report.

## Prompts

Representative prompts are in [the prompt log](prompt_log/index.md), verbatim. A sample:

> can you check skills tailored to me as my best practices, after that read carefully the markdown
> file take-home-assessment, then tell me what you think what should be the approach in executing
> and developing the app in fullstack starting from this bare frameworks i have setted up.

> uninstall the ws since it will conflict with socket.io

> is the blotter build plan properly aligned with the models in the markdown

> what are the remaining gaps besides the two that you have given a red banner BREAKS BUILD/RUN
> and other gaps listed?

The pattern is worth noting: the most useful prompts were narrow and adversarial. Asking whether
the plan actually matched the brief's model found a real omission that a broader "review this"
would not have.

## Decisions influenced by AI

**Verified against documentation, and changed as a result.** The initial Prisma schema was written
from recalled Prisma 6 conventions and would not have built. Reading the Prisma 7 documentation
first surfaced four breaking changes: `provider` is now `prisma-client` with a mandatory `output`,
the client is imported from the generated path rather than `@prisma/client`, a driver adapter
(`@prisma/adapter-pg`) is required, and datasource URLs move to a `prisma.config.ts`. None of that
was installed in the scaffold.

**Decimal prices.** Proposed and adopted immediately. A float price column on a trading system is
the kind of detail that undermines everything built on top of it.

**Separate liveness and readiness endpoints.** Proposed after noticing that the scaffold's
healthcheck would report a container healthy while its database was unreachable, and that the
frontend gated its startup on that signal.

**The shared contract package.** Proposed as the highest-leverage structural decision available,
on the grounds that "TypeScript usage" and "API contracts" are 20% of the assessment and a single
derived schema demonstrates both better than any amount of hand-written types.

## Accepted

- Postgres over SQLite, once the read-only container filesystem made the trade-off concrete.
- The npm workspace restructure, despite it being the change most likely to break the Docker
  build, because doing it later would have meant rewriting both Dockerfiles twice.
- Injecting the health probe behind a small interface. It removed a type cast from the test and
  made the readiness test honest.

## Rejected, and why

**"Every prompt gets a log entry."** The first version of the logging rule required an entry for
every prompt. The brief says the opposite in as many words: it is not interested in exhaustive
logs. The rule was rewritten to significant prompts only.

**Publishing artifacts only as hosted pages.** Convenient during development, but a published
artifact URL is private to the author's account, and the assessor receives a git repository and
nothing else. Every artifact is committed under `docs/artifacts/`.

**`npm audit fix --force`.** It resolves five high-severity findings by downgrading Prisma from 7
to 6, a breaking change, when the vulnerable paths are build-time only. Documented in the README
instead.

**A generated boilerplate `.env`.** Writing to `.env` files was refused by policy throughout, so
`DATABASE_URL` is supplied by compose and documented in the README rather than injected into a
file the repository does not own.

**Path aliases in the backend.** The house convention prefers them, but under ESM with `nodenext`
TypeScript does not rewrite them at emit, so they break at runtime without an extra build step.
The deviation is recorded in the README rather than papered over with another tool.

## Where AI was not relied on

Every "it works" claim was checked by running the thing: `tsc --noEmit` across all three
workspaces, `vitest` for the test suites, `prisma validate` for the schema, and `docker compose
build` for the images. Test counts and build results quoted in this repository are observed
output, not estimates.
