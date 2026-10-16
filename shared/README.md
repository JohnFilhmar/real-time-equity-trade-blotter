# shared

`@blotter/shared`: the client contract. One zod schema per model, every other shape derived from it,
so a field added in one place reaches the client types, the ticket's validation and the live
link's payload types together.

The .NET services do not import it. They mirror it: `libs/Blotter.Contracts` declares the same wire
shapes, and the gateway's validators are tested against `zod_cases.json`, the answers these schemas
give for 174 inputs. `node scripts/export_zod_cases.mjs` regenerates that fixture after a schema
change, and CI fails when the two disagree, so the API and the ticket never refuse with different
words.

The web app imports this package from its build output, and `main` and `types` point into `dist/`.
That is why `npm run build:shared` is not optional on a fresh clone, and why the root `pretest` hook
rebuilds it before every test run. Built with `tsc`, zod v4, no runtime dependencies beyond zod.

## What derives from what

`trade_schema` in `src/schemas/trade.ts` declares a trade's fields once. Every other trade shape is
derived from it rather than written again:

| Shape | Used for |
|---|---|
| `trade_schema` | The canonical model, and the response shape |
| `create_trade_schema` | The booking request. It omits the fields the server owns, so `tradeId`, `trader`, `currency`, `status`, `version` and the timestamps are never client input |
| `amendable_trade_schema`, `amend_trade_schema` | What an amendment may change, and the request carrying it |
| `cancel_trade_schema` | The cancellation request |
| `trade_query_schema` | Filters, sort, paging. The API parses the query string with this, and the client builds the URL from the same schema |
| `trade_list_schema` | A page of trades with its cursor |

The same pattern holds for `trade_event`, `position`, `auth` and the socket envelopes. A validation
message is written once here, so the ticket and the API's 422 quote the same sentence rather than two
wordings of one rule.

## Layout

| Path | What it is |
|---|---|
| `src/schemas/trade.ts` | The trade model and everything derived from it |
| `src/schemas/trade_event.ts` | The audit event, its query and list shapes, and the change set an amendment records |
| `src/schemas/position.ts` | The position row the server computes and broadcasts |
| `src/schemas/auth.ts` | The login request, the published user and the session |
| `src/schemas/problem.ts` | The problem detail shape every error returns, the stable error codes and the validation detail |
| `src/schemas/broadcast.ts` | The socket envelopes: trade events, positions and the mark set |
| `src/reference/instruments.ts` | The instruments, each with its currency and reference price |
| `src/reference/counterparties.ts` | The counterparties the ticket offers |
| `src/reference/roles.ts` | `VIEWER`, `TRADER`, `ADMIN` and the permissions each carries |
| `src/positions/position_book.ts` | Average cost, realised and unrealised P&L |
| `src/events/socket_events.ts` | The typed server-to-client and client-to-server event map |
| `src/index.ts` | The barrel. Both apps import from the package root, never a deep path |

## Two pieces of shared logic, not just types

Most of this package is schemas, but two parts are behaviour that both sides run, which is the reason
they live here rather than in either app.

**`position_book.ts`.** One walk over a trade list produces average cost, net quantity and realised
P&L. The client runs `apply_trade` when patching its own mutation into the cache, and unrealised P&L
is the same function marking open size against a mark. The trades service runs a C# port of the
same walk in `decimal` after every write and broadcasts the result per symbol, and its tests check
it against the cases this file was tested with.

**`roles.ts`.** `permissions_for` derives a permission set from a role. The API authorises on the
permission, and the interface hides controls using the same derivation, so a control is never offered
that the server will refuse.

## Conventions

**Field names are camelCase.** Clients read the JSON keys as they arrive, with no mapping layer.
Database columns stay snake_case,
mapped column by column in each service's EF Core model.

**Instruments and counterparties are a closed list.** `symbol` is an enum over the twelve names in
`instruments.ts`, not a free string, so an unknown ticker fails validation instead of reaching the
database.

**Prices carry their currency.** London names quote in GBX, pence, and `currency_of` derives the
currency from the symbol so the server never has to trust a client for it.

## Tests

`npm test` runs the tier with vitest: 60 tests across 5 files, colocated as `<subject>.test.ts` and
kept out of `dist/` by `tsconfig.json`. They cover the position walk, the role derivation, the
problem shape, and the trade and auth schemas, including that a page carries a cursor rather than an
offset and that a trade timestamp too far in the future is refused.

## Related

- [Repository README](../README.md): architecture decisions, installation, tests
- [`docs/api_reference.md`](../docs/api_reference.md): how these shapes appear on the wire
