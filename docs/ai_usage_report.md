# AI usage report

## Tools used

Claude Code, run from the terminal with access to the repository, the shell, Docker and my own
convention files. Three models were used across the project: Opus 5 for the backend and the
design phase, a design agent for the artboards and the interactive prototype, and Fable 5.1 for
the interface build, the wiring, the test tooling and this submission pass. Research subagents ran
web searches for the domain, real-time grid UX and grading signals. The prototype was checked in a
real browser through Playwright rather than by reading its source.

Two things mattered more than the model. Every claim about something building, passing or running
was produced by running it, and the agents were not allowed to decide anything.

## How it was used

One rule governed every session, recorded in the project memory on 2026-09-11: no agent decides
anything about this system. A library, a schema, an endpoint shape, a file layout, a scope cut, a
threshold, a name. Each stops and comes to me as a question with the options, the cost of each,
the agent's recommendation, and whether each option agrees with my own conventions. I answer, the
answer is logged, and only then is the code written.

That produced a particular shape of work. The prompt log holds forty entries across three agents
and most of them are me answering batches of questions: four questions on the MVP shape, three on the live feed,
sixteen on the server gap list across four rounds, thirteen on interface behaviour, twelve on the
submission pass. The agents did the research, the drafting and the verification. The decisions
are mine, and the log shows which ones.

Work ran in git worktrees, one per unit of work, merged to `main` after typecheck and tests
passed. Each phase read the brief and the existing code, put the choices to me, implemented,
verified by running, then recorded the outcome in [`docs/prompt_log/`](prompt_log/index.md) in
the same turn.

## Prompts

The prompts are in [the prompt log](prompt_log/index.md), verbatim, typos included. A sample of
the ones that shaped the system:

> can you check skills tailored to me as my best practices, after that read carefully the markdown
> file take-home-assessment, then tell me what you think what should be the approach in executing
> and developing the app in fullstack starting from this bare frameworks i have setted up.

> is the blotter build plan properly aligned with the models in the markdown

> remove trade cancellation reason, because modern trade sites does not have that requiring users
> to explain the reason for the cancelation.

> i want you to perform a deep research for what is needed for this application accordingly for
> what the user should see. [...] goal is to have a list of both ui/ux and server requirements to
> achieve a viable true MVP of this system.

> i might pull back 1 decision which is the role and permissions decision.

> 1a 2all recommended use docker compose instead of npm run dev 3a 4a
> 5-a-a-b(add zustand)-b-theme=a&b(3 options system, dark, light)-a 6Aa,Bb,Ca,Da,Ea 7AAC 8AB [...]

The last one is what most of my prompts looked like by the end: a line of answers to a numbered
list of questions. The narrow, adversarial prompts were the productive ones. Asking whether the
plan matched the brief's model found that the plan had no model in it at all.

## Decisions influenced by AI

**The shared contract package.** Proposed as the structural choice that would pay for itself most: one zod
schema per model in `shared/`, every inbound shape derived from it, every type inferred from it.
Accepted at the start and never revisited. It is the reason the API, the socket payload and the
grid cannot disagree about a field.

**Decimal prices, a separate readiness endpoint, Postgres over SQLite.** Proposed in the first
review of the scaffold and accepted. The readiness one came from noticing that the scaffold's
healthcheck would report a container healthy while its database was unreachable, and that the
frontend gated its own start on that signal.

**Keyset paging.** The first answer I gave was "data + total + limit + offset". The agent came
back later with the argument that an offset computed on one request points somewhere else on the
next when rows insert all day, so page two re-serves and skips rows. I changed the answer to a
cursor. The blotter now has over three thousand rows after a few hours of the simulated feed, and
the grid pages through them without a duplicate.

**Prisma 7 breaking changes.** The first schema was written from Prisma 6 memory and would not
have built. Reading the Prisma 7 documentation first found four changes: a mandatory `output`,
a driver adapter, a generated-path import and a `prisma.config.ts`.

**The two-client broadcast test.** The research subagent ranked "a test proves a broadcast reached
a second, uninvolved client" as the single highest-value open item. It was built at the transport
level with two Socket.IO clients, and then again in Playwright with two browser contexts, which is
the brief's literal acceptance criterion.

**What the interface does while the link is down.** Every behaviour in
[the interface spec](superpowers/specs/2026-09-12-interface-behaviour-design.md) was put to me as
a choice with a recommendation. I took the recommendation on each: mutations blocked with a reason
rather than queued, three connection states with green only after the refetch completes, a per-row
flash throttle as the WCAG 2.3.1 control, row-level keyboard focus, seven table states with copy.

## Where I overruled the AI

**Authentication and P&L.** The research ranked authentication twenty-seventh of twenty-eight
candidate items and P&L last, on the grounds that the rubric has no security line and P&L needs a
mark price the brief never supplies. I kept both. A blotter carries counterparty names, sizes and
prices, which is precisely what a firm does not serve to anonymous readers, and that argument
stands without the rubric. P&L was later narrowed to notional by symbol, labelled as such, because
inventing a mark would be inventing a financial convention.

**Roles and permissions.** My first model was no roles at all: sign up, log in, act. The agent
confirmed it was internally consistent and removed the role claim. I then pulled that decision
back, because a viewer who cannot cancel is something that can be shown working, and an
administrator who can act on anyone's trade gives the ownership rule a reason to exist. The agent
recommended holding the role-to-permission map as a constant; I chose three tables, so a
capability can move without a deploy.

**Typeface.** I suggested Roboto and Source Sans 3 from a search result. The agent argued both are
neutral sans at the same optical weight, so the pairing carries no contrast, and that a dense
numeric grid needs proportional against monospace. I kept its IBM Plex Sans and Plex Mono.

**Cancellation reason.** The design carried a required reason with five canned values. I removed
it: a trader is not asked to justify a cancellation, and the brief says a simple status transition
is sufficient.

**Positions and the audit trail on the server.** For the submission pass the agent recommended
computing positions on the client from the loaded rows, and showing history per trade only. I chose
a server aggregate and a global event feed instead, because a figure computed from one page of a
paged list is wrong the moment there is a second page.

**Connection state and filters.** The agent recommended Context for connection state and
component state for filters. I chose a zustand store and the URL respectively: many components
subscribe to the link state, and a filtered blotter should be linkable.

## The hardening pass

After submission was assembled I used the app the way a grader would, with the network panel open,
and found four things no test had caught: opening the audit trail and waiting produced a request
per loaded page per broadcast and tripped the API's own rate limiter; the login form jumped when an
error appeared; there was no way to reveal a password; and the positions page showed a proportion
bar where the prototype had a trend line. I wrote them up with the file and line for each and gave
them to the agent with the standing rule intact.

The agent verified each before touching anything, measured the first two (96 requests in 90
seconds across two windows with four audit pages loaded; a 17 pixel shift), and put the fixes to me
as options. On the refetch storm it laid out four, said which one made the audit trail and the
positions genuinely socket-driven rather than poll-on-event over HTTP, and told me the rate limit
was right and the client was wrong. I chose that one. On the positions line it told me the honest
answer was scope, not a bug, and reminded me the research had ranked P&L last; I reversed my own
earlier narrowing and opened P&L anyway, on a simulated mark labelled as such, because the walk
already existed in the spec and the page without it read as unfinished.

The same pass moved the database into its own unit under `database/`, against the advice in my
own prompt, because a deliverable that is one README next to a schema living elsewhere is not a
deliverable.

The pass ended with research into what real blotters do that this one did not, delivered as a
ranked table of candidates with the hours and the rubric line each one moved, and a recommended cut
after the fifth row. I took the four above the cut: the sequence-gap and flash rules moved out of
the provider and the hook into pure functions with their own tests; rows that did not trade today
show their date in the time column; the README says how to run the feed fast enough to watch the
client coalesce a burst; and a browser journey drops the link, checks that booking is blocked with
a reason, and checks that the client resyncs before it calls itself live. The ten below the cut
stayed below it.

## The sign-in door

The last thing I asked for was a login page that read as a private firm's system rather than the
centred card every product ships. I asked for options, not a design, and the agent answered with
an artifact of six layouts running live on the app's own tokens, each with its loading, splash,
motion and interactivity costs priced separately, a ranked cut, and a list of seven decisions with
its recommendation against each. It also found a defect the options all inherited: the page was
blank for the whole session-restore round trip, because the gate that stops a signed-in person
seeing a form on reload held back everything, not just the form. I chose the ledger split and the
recommendations, and the build kept the form byte for byte behind the ids the browser journeys
sign in through. The one thing it flagged rather than did was the lockout countdown's source: the
API carries the seconds only inside its sentence, so the client reads that sentence and the report
names a `Retry-After` header as the cleaner contract. Lighthouse then caught what the old glass
card had hidden: the muted text token sits under 4.5:1 on the light ground, so the door's own copy
moved one step up the text ramp rather than the theme being touched.

The door then gained a backdrop, a crossfade of photographs at low opacity that changes every
five seconds and stops under reduced motion. The three files under `frontend/public/login/` are
stand-ins drawn by a script, dark gradients at the size and mood the real images need, so the
carousel, the container copy of `public/` and the browser journey could be verified before any
photograph existed. The photographs are to be generated with an image model from three prompts I
asked the agent to write: a London equities floor at dawn, two traders over one monitor with a
desk head behind, and a close-up of a desk after the close, each constrained to no legible text,
no logos, faces out of focus and a dark cool grade so the copy in front keeps its contrast. When
they replace the stand-ins, that is their provenance.

## Where the AI was wrong, and caught

**U-M4 in the gap analysis.** The first revision claimed the prototype had no up or down tick
glyph and carried direction by colour alone. The design agent counted three occurrences of
`tickMark()` in the prototype source. The analysis was corrected, and the real WCAG 1.4.1 gap
turned out to be narrower: the row flash differed only in hue. That is what the direction arrow on
the flash now fixes.

**The container defects.** Two of the three real defects on this project were invisible to the
test suite and appeared only when containers ran: npm as PID 1 swallowing SIGTERM, and `io.close()`
already closing the HTTP server. A third appeared in the submission pass: the redis container
crash-looped because `cap_drop: ALL` removed the capability its entrypoint used to drop root. All
three were found by running the stack rather than reasoning about it.

**Feed price precision.** The live feed booked prices with six decimals, which the domain research
lists as a tell that data is generated. Found by reading a real row from the running API.

## Rejected suggestions

- "Every prompt gets a log entry." The brief says it is not interested in exhaustive logs. The
  rule was rewritten to significant prompts only.
- `npm audit fix --force`, which resolves five high-severity findings by downgrading Prisma from 7
  to 6. The vulnerable paths are build-time only. Documented instead.
- A generated `.env`. Writing to `.env` files is refused by policy in every project of mine, so
  configuration comes from compose and is documented in the README.
- Path aliases in the backend. My house style prefers them, but under ESM with `nodenext`
  TypeScript does not rewrite them at emit. The deviation is recorded rather than papered over.
- `concurrently` for a root `npm run dev`. Development runs through docker compose instead, so
  there is one way to run the system rather than two.
- A standalone seed script. The API already seeds an empty database on start and the feed keeps
  generating, so a second seeder would be a second thing to keep correct.

## Where AI was not relied on

Every "it works" claim was checked by running the thing: `tsc --noEmit` across all three
workspaces, `vitest` for the unit and integration suites, Playwright for the browser journeys,
`docker compose up --build` for the images, and a browser for the interface. Test counts and
scores quoted in the README are observed output. Where something was not run, the README and the
verification table say `NOT RUN` rather than assuming.
