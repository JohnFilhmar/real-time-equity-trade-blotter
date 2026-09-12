---
handoff_label: ui_ux_planning
session_id: UNKNOWN - not verified this session
agent: UI/UX for the Fusion Blotter. Visual direction, design tokens, the interactive prototype, and every interface decision taken against the brief and the MVP gap analysis. No application code was written.
working_dir: D:\My Folder\tp-icap-take-home-assessment
branch: main
written: 2026-09-12 12:10
status: done
---

# Handoff: Fusion Blotter UI/UX planning

**Written:** 2026-09-12 12:10
**Working dir:** `D:\My Folder\tp-icap-take-home-assessment`
**Branch:** `main`
**Last commit:** `4597887 Merge the auth, roles and permissions decisions into main`

This file is deliberately committed to the repository rather than kept under `~/.claude/handoff/`,
against the usual rule, because the agent picking it up starts from a clone and cannot read a path
on this machine.

## Goal

Produce the interface for a real-time equity trade blotter before it is built: visual direction,
tokens, an interactive reference, and a decision record the assessor can read. The owner's standing
rule throughout was that **no agent decides anything about the system**. Every choice below was put
to him as an explicit question with options and a recommendation, and every one of them is his.

Carry that rule forward. It is written up in the `agent-never-decides` memory and the reason is that
this is a graded take-home whose rubric scores engineering decisions and the explanation of them.

## Done (verified)

### Artifacts on `main`

| Path | What it is |
|---|---|
| `docs/artifacts/fusion_blotter_prototype.html` | The interactive reference. 86KB, one file, no build step |
| `docs/artifacts/fusion_blotter_design_canvas.html` | Static gallery of 23 artboards |
| `docs/artifacts/fusion_blotter/` | The same 23 artboards as standalone pages |
| `docs/artifacts/design_data_shape_conformance.html` | Field-by-field audit of the design against the brief's payload |
| `docs/artifacts/mvp_requirements_and_gap_analysis.html` | Not mine. Written by another agent; the gap list I answered |
| `docs/superpowers/specs/2026-09-12-trade-api-design.md` | API, data model, auth. Thirteen decisions |
| `docs/superpowers/specs/2026-09-12-interface-behaviour-design.md` | Interface behaviour. The rest |

### Verified by execution, not by assertion

- Prototype renders correctly at desktop, tablet and phone, in both themes. Driven in a real browser:
  row select, cancel dialog, confirm, status flip, toast.
- `node --check` on the extracted prototype script: PASS.
- CSS brace balance 0, zero unclosed HTML tags, zero non-ASCII literals in the prototype.
- All 58 colour tokens present in all three theme blocks, zero references to undefined tokens, zero
  inline colour values outside the definitions.
- Two claims in the MVP gap analysis disproved by counting occurrences in the prototype source. See
  "Corrections" below.

### Design sources

The working `.dc.html` artboards live **outside the repository** at
`C:\Users\olajo\.claude\design\fusion-blotter\`, 25 files. They are not needed to continue. The
prototype supersedes them wherever the two disagree, and the in-repo copies under
`docs/artifacts/fusion_blotter/` are what the assessor sees.

## Not started

No application code exists for the interface. `frontend/` is still a bare `create-next-app`
scaffold: Next 16.3.4, React 19.2.8, Tailwind v4, `@blotter/shared` wired, default Geist fonts,
default `globals.css`.

In the order it should be tackled:

1. Port the prototype's token block into `frontend/app/globals.css` as a Tailwind v4 `@theme`.
2. Build the blotter grid against the real API with TanStack Table.
3. The live-update behaviour in the interface spec.
4. The ARIA and keyboard work.
5. Positions, audit, and the auth screens.

## Key decisions and why

Twenty-one decisions are recorded across the two spec files with the option set each came from.
These are the ones a new agent is most likely to re-litigate, so they are repeated here with the
reasoning.

### Visual direction: A, with B's glass

Three directions were drawn. The owner chose **Direction A's neutrals with Direction B's glass
material**, not either wholesale.

- Neutrals are A's blue-slate: `#0B111C` ground, `#131C29` surface, `#DCE4EE` and `#9DB0CA` text.
- Glass is B's: `backdrop-filter: blur(18px) saturate(140%)` with a light edge.
- Money colours are A's, **softened about 15%**: gain `#34D399` became `#46D4A0`, loss `#FB7185`
  became `#F58598`. Saturated semantics vibrate against a blurred panel; that is why B had softer
  ones, and taking B's glass meant taking some of that softening.
- Type is **IBM Plex Sans and IBM Plex Mono**. Roboto and Source Sans 3 were considered and
  rejected: both are neutral sans at the same optical weight, so pairing them carries no contrast.
  In a dense numeric grid the axis that matters is proportional against monospace. Plex Mono's zero
  is dotted by default, so `0` reads clearly against `O` with no font-feature CSS.

### Themes: every translucent value is a token, written out per theme

This is the single most breakable thing in the prototype. Do not undo it.

58 tokens, each defined separately in all three theme blocks rather than derived by re-alpha-ing one
base, because **glass is a different recipe in each theme**:

| Token | Dark | Light |
|---|---|---|
| `--glass` | `rgba(30,42,61,.55)`, translucent dark | `rgba(255,255,255,.72)`, frosted white |
| `--glass_edge` | `rgba(120,200,220,.22)`, light highlight | `rgba(15,27,42,.11)`, dark hairline |
| `--brand_lo` | `#67E8F9`, brighter | `#0E7490`, darker |

Light values come from Direction C, not from inverting dark. Semantics go darker on light
(`#047857`, `#BE123C`, `#B45309`) to hold AA on white. Flipping alphas alone produces a light theme
full of muddy grey panels and invisible edges.

The bare `:root` block is dark because the design is dark-first; light sits in
`@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) }` and `:root[data-theme="light"]`.

### AMENDED is not a status. Do not reintroduce it.

`shared/src/schemas/trade.ts` keeps `trade_status_values` two-valued, and the JSDoc there explains
why. An amended trade is `ACTIVE` carrying an amber version pill (`v2`). The design originally drew
`AMENDED` as a third status badge across 15 boards and that was reversed. The industry does the same
thing: the wire protocol uses cancel-and-correct pairs, the store versions an immutable record, the
UI shows a badge.

### There is no cancellation reason

Removed across nine call sites on 2026-09-11. Modern trading UIs do not make a trader justify a
cancellation, and the brief says a simple status transition is sufficient. Cancel is a plain
confirm whose dialog explains what the transition does. **Do not add a `cancel_reason` column.**

### Live update behaviour

- **Arrivals:** at the top the grid follows the feed; scrolled away it pins and shows a
  "3 new trades" pill. Selection is held by `trade.id`, never row index. Rows are patched in place
  and the array is never wholesale replaced, which is what would reset scroll.
- **Conflation needs two controls, not one.** `requestAnimationFrame` collapses updates to one
  render per frame, and separately each cell refuses a new flash within 333ms. rAF alone still
  permits 60 renders a second, so it is a performance control and not a WCAG 2.3.1 control.
- **Connection has three states:** `LIVE`, `RECONNECTING` amber, and `RESYNCING` between socket-open
  and the refetch completing. Green never appears the instant the socket opens.
- **Mutations are blocked while disconnected, never queued.** A confirmation for a trade the server
  has not accepted is a worse failure in this domain than a disabled button.

### Accessibility

- Grid semantics are entirely absent from the prototype and must be added: `role="grid"`,
  `aria-rowcount`, `aria-rowindex`, `aria-sort` on the sorted header, and a polite `aria-live`
  region announcing arrivals **as a count**, not row by row.
- Keyboard is **row-level**, not cell-level: one tab stop, roving focus between rows, Enter opens
  the ticket, Escape closes it. The unit of work on a blotter is the trade, and no cell is
  individually editable.
- The row flash carries direction by hue alone, which is the real WCAG 1.4.1 gap. Fix is to
  desaturate the tint until text clears 4.5:1 and add a transient direction arrow. Contrast must be
  checked in four combinations: two themes times two flash states. Text in a flashed cell is
  measured against the **flash** colour, not the row colour.

### Seven table states, each with copy

Loading, empty, no-results, error, disconnected, resyncing, and filtered-to-zero-while-live. The
last three exist because of the connection decision. An empty grid with no message is a bug.

### Permission-aware UI

Three roles: `VIEWER`, `TRADER`, `ADMIN`. This is UX only; the server re-checks every time.

- **Hidden** for a capability the account will never have. A `VIEWER` does not see New trade, the
  FAB, or Amend and Cancel at all.
- **Disabled with a reason** for a block that will lift, which is the disconnected state.
- **Disabled per row** for ownership: a `TRADER` viewing another trader's trade sees Amend and
  Cancel greyed. Hiding per row would make controls appear and vanish as selection moves, reading
  as a bug.

### Grid implementation: TanStack Table, headless

Chosen over AG Grid and hand-rolling. AG Grid brings its own theme and DOM, which would mean the
design tokens overriding a third-party stylesheet rather than owning the primitive. Headless ships
no styling, so it composes with the `web-design-system` rule that a consumer never overrides a
primitive's core look.

## Corrections to the MVP gap analysis

`docs/artifacts/mvp_requirements_and_gap_analysis.html` is a strong document, and two of its
interface findings do not hold. Both were checked by counting occurrences in the prototype source.

- **U-M4 as written is wrong.** It claims "no up-tick or down-tick glyph anywhere in the prototype.
  Direction is carried by colour alone." The prototype has `tickMark()`, which emits `&#9650;` and
  `&#9660;` into `span.tick.up` and `span.tick.down`, three occurrences, in the price cell of both
  the grid and the card list. Side is the literal text `BUY` or `SELL` and every P&L figure is
  signed. The real 1.4.1 gap is the row flash, described above.
- **U-M16 is already satisfied**, not partial. The buttons are already "Keep trade" and
  "Cancel trade" and the recap already restates symbol, side, quantity, price and notional.

The other eight hold. Counted in the same file: `role="grid"` 0, `aria-sort` 0, `aria-live` 0,
`requestAnimationFrame` 0, `ArrowDown` 0, `keydown` 1, `Escape` 1.

## Constraints and gotchas

- **`frontend/AGENTS.md` warns this is not the Next.js you know.** Next 16 has breaking changes.
  Read `node_modules/next/dist/docs/` before writing code. The context7 MCP server was down this
  session, so local docs are the route.
- The prototype has **zero non-ASCII literals on purpose**. The minus sign, placeholder dash and
  mobile tab glyphs are JS `\uXXXX` escapes. A literal UTF-8 minus mojibaked to `â^'3.81M` when
  served without a charset, which is how this was found. Keep it that way.
- Worktree-isolated sessions **refuse compound shell commands**. `sed -f`, a `for` loop over `sed`,
  and even `cat >> file <<EOF` followed by `tail` are all rejected as too complex to verify. Split
  into plain single commands, or use Python.
- Bash heredocs over roughly 30KB fail on this machine with `ENAMETOOLONG: name too long, uv_spawn`.
  Use the Write tool for large files and `-F <file>` for commit messages.
- `EnterWorktree` branches from `origin/<default>`, not local `main`.
- **No AI attribution in any git artifact.** No `Co-Authored-By`, no "Generated with".
- Prompt log rule, in the repo `CLAUDE.md`: append-only, newest at the bottom, one file per agent,
  verbatim prompt, one-to-two sentence outcome. Never edit a past entry.
- **The one-file-per-agent log rule caused three merge conflicts this session**, because one agent
  ran three worktrees and all three appended to `main_session.md`. The rule keys on agent identity
  while worktrees key on work. Worth fixing in the repo `CLAUDE.md`; it is raised but not resolved.

## Verification state

- Build: NOT RUN. No application code was written by this agent.
- Tests: NOT RUN. Same reason.
- Lint/typecheck: NOT RUN. Same reason.
- Prototype JS syntax: PASS, `node --check` on the extracted script.
- Prototype structure: PASS. CSS braces balanced, zero unclosed tags, 58 colour tokens in parity
  across three theme blocks, zero undefined token references, zero non-ASCII characters.
- Prototype rendering: PASS, observed in a real browser at three widths in both themes.
- Cancel flow: PASS, driven end to end in the browser.
- Canvas re-seed and republish after the LightDesktop filter fix: NOT RUN. The fix is in the source
  and in the in-repo copy, but the published canvas still shows the defect.

## Open questions for the user

1. **Permission caching.** Roles are three database tables so a capability can move without a
   deploy. A per-request join for twelve rows wants a cache, but whether it loads once at boot or
   refreshes on a TTL decides how fast a permission edit takes effect, which is the whole reason
   they are data. Deliberately left unsettled.
2. **Merge mechanism.** `worktree-feature-flow` forbids working on `main` and forbids merging
   without review, but never says whether a merge goes through a PR. Another agent has since used a
   PR (`8ded214`, PR #1), so there is a de-facto answer the skill does not state.
3. **No CI exists.** There is no `.github/workflows/`, while the skill's Deploys section describes a
   pipeline that runs build, tests and a security gate on every push.

## Resume here

Read both specs first: `docs/superpowers/specs/2026-09-12-trade-api-design.md` and
`docs/superpowers/specs/2026-09-12-interface-behaviour-design.md`. Between them they hold all
twenty-one decisions with the options each was chosen from.

Then open `docs/artifacts/fusion_blotter_prototype.html` in a browser. It is one file with no build
step and it is the behavioural reference: sort, filter, book, amend, cancel, watch prices tick,
press "Drop link" to see the reconnect lifecycle. Reading its source is faster than reading the
specs for anything about how something should feel.

The first implementation step is porting the prototype's `:root` token block into
`frontend/app/globals.css` as a Tailwind v4 `@theme`, keeping all three theme blocks intact.

**Do not** rework the static artboards, reintroduce `AMENDED` as a status, or add a cancellation
reason. Those are settled and the reasoning is above.
