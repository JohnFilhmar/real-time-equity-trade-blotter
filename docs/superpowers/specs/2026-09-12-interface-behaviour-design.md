# Interface behaviour design

**Date:** 2026-09-12
**Status:** approved, not yet implemented
**Companion to:** [Trade API design](2026-09-12-trade-api-design.md)
**Source of the gap list:** [Blotter MVP Requirements](../../artifacts/mvp_requirements_and_gap_analysis.html)

## Why this exists

The MVP requirements document checked the interface against the prototype source and produced a
ranked gap list. This records what the repository owner decided about each gap. Nothing here was
chosen by an agent, per the `agent-never-decides` memory.

## Two claims in the gap list that did not hold

Both were checked by counting occurrences in `docs/artifacts/fusion_blotter_prototype.html` on
`origin/worktree-hifi-prototype`.

**U-M4 as written is wrong.** The claim was "no up-tick or down-tick glyph anywhere in the
prototype. Direction is carried by colour alone." The prototype has `tickMark()`, which emits
`&#9650;` and `&#9660;` into `<span class="tick up">` and `<span class="tick down">`, three
occurrences, rendered in the price cell of the grid and the card list. Side is the literal text
`BUY` or `SELL`, and every P&L figure carries a `+` or a minus sign.

There is a real 1.4.1 gap behind the mistaken evidence, and it is the **row flash**: `flash_up` and
`flash_down` differ only in hue. That is what the U-M4 decision below addresses.

**U-M16 is already satisfied**, not partial. The buttons are already labelled "Keep trade" and
"Cancel trade", and the recap already restates symbol, side, quantity, price and notional.

The remaining eight items hold. Counted in the same file: `role="grid"` 0, `aria-sort` 0,
`aria-live` 0, `requestAnimationFrame` 0, `ArrowDown` 0, `keydown` 1, `Escape` 1.

## Decisions

| # | Decision | Chosen |
|---|---|---|
| D2 | P&L board | Held: build the in-memory mark feed as specced on 2026-09-12T02:10Z |
| D3 | Authentication | Held: build the full `backend-security-baseline` |
| D10 | Grid implementation | TanStack Table, headless |
| C4 | "Trade date" chip | Add `from` and `to` to `trade_query_schema` |
| C5 | "Desk: LONDON" chip | Drop it. There is no desk field |
| U-M4 | Flash direction | Desaturate the tint, add a transient direction arrow |
| U-M5 | Arriving rows | Follow at top, freeze when scrolled, count pill |
| U-M6 | Conflation | rAF coalescing plus a per-cell flash throttle |
| U-M8 | Offline mutations | Blocked, with a reason, never queued |
| U-M9 | Connection states | Three states; green only after the refetch completes |
| U-M12 | Keyboard | Row-level roving focus |
| U-M13 | Flash contrast | Verified in both themes and both flash states |
| U-M14 | Table states | Seven, with real copy |

D2 and D3 were put back to the owner because the research ranks P&L last and authentication
twenty-seventh of twenty-eight candidate items, and the research predates the 02:10Z scope choice by
thirteen minutes. Both were held deliberately with that ranking in view.

D10 agrees with `web-design-system`: a headless table ships no styling, so the in-house primitive
keeps ownership of the look. AG Grid would have meant design tokens overriding a third-party
stylesheet instead.

## Live update behaviour

### Arrivals and the viewport (U-M5)

- Scrolled to the top: the grid follows the feed and new rows push in.
- Scrolled away: the viewport is pinned. A "3 new trades" pill appears at the top edge and scrolls
  there when clicked.
- Selection is held by `trade.id`, never by row index, so a selected row cannot change identity
  under the user.
- Mid-edit is unaffected: the ticket is a modal editing its own copy and only re-reads on save.
- Rows are keyed by `trade.id` and patched in place. The row array is never wholesale replaced,
  which is what would reset scroll.

### Conflation (U-M6)

Two controls, because one does not cover the other:

- `requestAnimationFrame` collapses all pending updates into at most one render per frame. This is a
  performance control.
- Each cell refuses to begin a new flash within 333ms of its last. This is the WCAG 2.3.1 control.
  rAF alone still permits sixty renders a second, so it does not satisfy 2.3.1 on its own.

### Connection lifecycle (U-M8, U-M9)

Three states, not two:

| State | Colour | Meaning |
|---|---|---|
| `LIVE` | cyan | Socket open and the data has been reconciled |
| `RECONNECTING` | amber | Socket down, retrying |
| `RESYNCING` | cyan, distinct copy | Socket open, refetch in flight, data not yet trustworthy |

Green never appears the instant the socket opens. While not `LIVE`, the New trade, Amend and Cancel
controls are disabled and carry a reason. Mutations are never queued: a confirmation for a trade the
server has not accepted is a worse failure in this domain than a disabled button, and queueing would
pull in a sync path that `testing-stance` would then require tests for.

## Accessibility

### Grid semantics (ARIA)

Currently absent entirely. To add:

- `role="grid"` on the container, `role="row"` on rows, `role="columnheader"` on header cells,
  `role="gridcell"` on cells.
- `aria-rowcount` and `aria-colcount` on the grid, `aria-rowindex` on each row, so a screen reader
  reads position against the full set rather than the rendered window.
- `aria-sort` on the sorted column header, `ascending` or `descending`, absent on the rest.
- A polite `aria-live` region announcing arrivals as a count, not row by row. Announcing every
  arriving trade individually would be unusable on a live feed.

### Keyboard (U-M12)

Row-level, which is the unit of work on a blotter, since no cell is individually editable:

- One tab stop for the whole grid, roving focus between rows via `tabindex` 0 and -1.
- Up and Down move row focus, Home and End jump to first and last.
- Enter opens the ticket for the focused row, Escape closes it and returns focus to that row.
- Focus is visible at all times and never lost when rows arrive.

### Colour and contrast (U-M4, U-M13)

- The flash tint is desaturated until text over it clears 4.5:1.
- Contrast is verified in four combinations: light and dark theme, each in the up-flash and
  down-flash state. The trap is measuring text against the row colour when the flash colour is what
  is actually behind it.
- A transient direction arrow appears in the changed cell, so the flash never carries direction by
  hue alone.

## Table states (U-M14)

Seven states, each with copy that says what happened and what to do next:

| State | When |
|---|---|
| Loading | First fetch in flight |
| Empty | No trades exist at all; offers to seed |
| No results | Trades exist, filters exclude all of them; offers to clear filters |
| Error | Fetch failed; names the failure and offers retry |
| Disconnected | Socket down; rows shown are stale, mutations disabled |
| Resyncing | Socket back, refetch in flight |
| Filtered to zero while live | Filters exclude everything but the feed is running |

The last three exist because of the U-M8 and U-M9 decision. An empty grid with no copy is a bug in
every one of these.

## Filters (C4, C5)

`trade_query_schema` gains `from` and `to`, both optional ISO datetimes, derived from the one
canonical schema rather than hand-written. The existing `trade_status_timestamp_idx` already covers
the range scan.

The "Desk: LONDON" chip is dropped. There is no desk field, and `book` values are `EQUITIES_UK`,
`EQUITIES_US` and `TECH_GROWTH`, none of which is a desk. Aliasing one to the other was rejected
because a reader who knows the domain reads desk and book as genuinely different things.

## Permission-aware UI

Added 2026-09-12 when roles were reinstated. Three roles, `VIEWER`, `TRADER` and `ADMIN`; the API
spec holds the permission table.

`web-design-system` is explicit that this is UX only and the server re-checks every time, so nothing
below is a security control. The server already refuses a `VIEWER` write with 403 and a `TRADER`
writing another trader's row with 404 whether or not the button was rendered.

- **Hidden, not disabled, for a missing capability.** The Login board already specifies it: "book,
  amend and cancel stay hidden unless your desk role allows them". A `VIEWER` does not see New
  trade, the FAB, or the Amend and Cancel buttons in the detail drawer at all. Showing a permanently
  disabled control for a capability the account will never have is noise.
- **Disabled, not hidden, for a temporary block.** The disconnected state from the U-M8 decision
  disables the same controls with a reason, because that block will lift. The two cases look
  different on purpose: gone means never, greyed means not right now.
- **Ownership is per row, so it is disabled rather than hidden.** A `TRADER` looking at another
  trader's trade sees Amend and Cancel greyed with "Booked by ABROWN, desk head only", which is the
  ProfileMobile wording. Hiding them per row would make the drawer's controls appear and disappear
  as the selection moves, which reads as a bug.
- **`ADMIN` sees no extra chrome.** The only difference is that nothing is greyed. There is no admin
  screen, because the desk head's extra power is scope, not a new feature.
- The empty and no-results copy differs for a `VIEWER`: it never offers "book the first one", since
  that account cannot.

## Unchanged and not to be revisited

- The static artboards are not reworked for D1 through D6. The prototype supersedes them wherever
  they disagree.
- `AMENDED` is not a status. An amended trade is `ACTIVE` with a version pill.
- There is no cancellation reason.
