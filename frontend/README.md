# frontend

The blotter's web app. Next.js 16.3 App Router, React 19.2, Tailwind v4, TanStack Query 5, TanStack
Table 8 with react-virtual, socket.io-client 4.8, Zustand 5 for hot client state, and the shared zod
contract for every payload it reads.

Run it through the root scripts in the [repository README](../README.md). 134 TypeScript files, 27
of them unit suites, plus 10 Playwright journeys.

## How a change reaches the screen

This is the part worth understanding, because it is what makes the blotter live.

1. A mutation goes over HTTP, never the socket, so it gets the same validation and error handling as
   any write. `src/hooks/useTradeMutations.ts`.
2. The server broadcasts the result. One socket connection per signed-in session, owned by
   `src/providers/ConnectionProvider.tsx`.
3. Trades, audit events and positions arrive in a **single sequence**. The provider queues them and
   applies them **once per animation frame**, in sequence order, so a burst of twenty broadcasts
   costs one render rather than twenty.
4. Each one is patched into the TanStack Query cache in place by `src/lib/query/settleTrade.ts` and
   `settleEvent.ts`, which call the pure functions in `applyBroadcast.ts` and `applyEvent.ts`. No
   HTTP request is made while the link is healthy.
5. Marks carry no sequence and are not cache data. They go straight to a Zustand store,
   `src/lib/stores/markStore.ts`, because they arrive every 900ms and only the P&L cells read them.

**When the sequence breaks.** A gap, or a sequence that went backwards because the API restarted,
triggers a full resync rather than a guess about what was missed: invalidate trades, positions and
the event feed, then wait. The connection pill only turns green once that refetch has settled, so it
never claims to be live while the rows on screen are still old. A resync carries a generation
number, so a slow one cannot overwrite a newer one. `src/lib/socket/sequence.ts` holds the ordering
rules and is unit tested.

## Provider layers

`src/app/providers.tsx` composes the root layer, outermost first:

```
ThemeProvider      the chosen theme, persisted
  QueryProvider    the TanStack Query client
    SessionProvider  the access token, refresh and the signed-in user
```

`ConnectionProvider` is deliberately **not** in that list. It needs an access token, so it mounts
inside the session gate in the authenticated route group. A socket opened before the session
restores would connect unauthenticated and be refused.

## Rendering boundaries

`src/app/layout.tsx` is a Server Component. It inlines a small script that reads the stored theme
and sets `data-theme` **before first paint**, so a pinned theme never flashes the other one on
reload. The script reads the key exported from `src/lib/theme/themeStorage.ts`, which lives outside
the theme provider on purpose: a value imported from a `'use client'` module reaches a Server
Component as a client reference rather than a string, so the inlined script would read `undefined`.

`src/app/(app)/layout.tsx` renders the shell immediately and defers only the section beneath it. The
top bar, the tabs and the connection pill are on screen while the session restores, and each route
supplies its own skeleton (`BlotterSkeleton`, `PositionsSkeleton`, `AuditSkeleton`) rather than the
whole page blanking.

Routes: `/` the blotter, `/positions`, `/audit`, and `/login` outside the authenticated group.

## Where state lives

Three places, chosen by how the state behaves.

| State | Home | Why |
|---|---|---|
| Server data: trades, positions, audit events | TanStack Query cache | It is server truth, patched by broadcasts, and needs caching and refetch |
| Filters, sort, paging | The URL | A filtered blotter is linkable, survives a reload, and the back button undoes a filter |
| Connection status, marks, toasts | Zustand stores | Changes often, read by few components, and nothing else should re-render for it |
| Row selection, open ticket | Component state | Never outlives the screen |

## Directory map

```
src/app/            routes, the root layout, the global stylesheet and design tokens
src/providers/      theme, query client, session, and the socket that patches the cache
src/components/
  blotter/          the grid, filter panel, KPI strip, date range
  trade/            the ticket: create, amend, cancel, and conflict handling
  positions/        net position and P&L per symbol
  audit/            the amendment trail
  shell/            top bar, tabs, connection pill
  auth/             the sign-in form and the session gate
  ui/               11 in-house primitives: Button, Field, Dialog, Toggle, Badges and the rest
src/hooks/          one hook per camelCase file: useTrades, usePositions, useMarks, useFlash,
                    useRovingRows, useTradeMutations, useListQuery, useConnection, useMediaQuery
src/lib/
  api/              typed clients over the shared contract, plus the paths the server forwards
  query/            query keys, the cache patch functions, the trade query and date range parsing
  socket/           socket creation and the sequence rules
  stores/           connection, marks, toasts
  auth/             permission checks and the client-side lockout countdown
  format/           money and clock formatting
  grid/             flash timing and keyboard focus
  theme/            the storage key the pre-paint script and the provider share
src/types/          shapes the components share
e2e/                Playwright journeys, run against the compose stack
```

## The grid

TanStack Table headless, so the in-house primitives own the look, with react-virtual for rows. Below
`lg` the table becomes cards and the filters move into a panel, reachable on tablet and phone.

A changed cell flashes once, held to one flash per cell per interval by `src/lib/grid/flash.ts`, so a
busy feed does not strobe. Rows are a single tab stop with roving focus
(`src/hooks/useRovingRows.ts`): arrows move by row, focus survives a re-render, and clicking a row
gives it the tab stop so the arrows continue from there. There is a skip link to the trades.

## Permissions in the interface

`src/lib/auth/permissions.ts` derives the permission set from the role in the shared contract, the
same derivation the API uses. A control the current user cannot use is not rendered, rather than
rendered and rejected: a `VIEWER` sees no booking controls, and a trader sees another trader's trade
greyed with the reason. The server still enforces every rule; the interface only avoids offering
what will be refused.

## Tests

`npm test` runs the unit tier with vitest and jsdom: 188 tests across 27 files, colocated beside
what they cover. The ones that carry real behaviour are `lib/query/applyBroadcast.test.ts` (where a
broadcast lands in a sorted, filtered, paged view, and that a stale version is dropped),
`hooks/useRovingRows.test.tsx`, `lib/grid/flash.test.ts` and the ticket validation suites under
`components/trade/ticketForm/`.

`npm run test:e2e` runs 10 Playwright journeys against a running stack: live sync between two
browser contexts, a concurrent amend refused with 409, role rules, a dropped link blocking booking
then resyncing, lockout with its countdown, theme persistence, the filters below `lg`, and keyboard
use. Specs are tagged `@smoke` and `@critical` so a subset can run on its own.

The suite signs each demo account in once per run and shares the session, because the API limits
credential requests to ten a minute per address and the suite tests the stack as shipped.

## Scripts

Run from `frontend/`, or from the root with `--workspace frontend`.

| Script | Does |
|---|---|
| `npm run dev` | `next dev`, forwarding the API paths to `:5000` |
| `npm run build` | `next build` |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` | The unit tier, vitest with jsdom |
| `npm run test:e2e` | Playwright against `http://localhost:3000`, or `E2E_BASE_URL` |
| `npm run test:lighthouse` | Lighthouse on the login page and the blotter, reports in `lighthouse/` |

## Styling

Tailwind v4. The design tokens in `src/app/globals.css` come from
[the prototype](../docs/artifacts/fusion_blotter_prototype.html) and are mapped onto utilities with
`@theme inline`, so `bg-glass` and `text-gain` follow the active theme at runtime. Class names use
the theme scale (`px-3.5`, not `px-[14px]`) wherever a step matches exactly.

## Related

- [Repository README](../README.md): architecture decisions, installation, the full test table
- [`docs/api_reference.md`](../docs/api_reference.md): endpoints, payloads, errors, socket events
- [`shared/README.md`](../shared/README.md): the contract this app imports
- [the interface behaviour spec](../docs/superpowers/specs/2026-09-12-interface-behaviour-design.md)
