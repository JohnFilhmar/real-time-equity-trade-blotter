# shared

`@blotter/shared`: the one contract the API and the web app both import. One zod schema per model,
every other shape derived from it, so a field added in one place reaches the API validation, the
client types and the socket payload together. The whole stack is described in the
[repository README](../README.md).

Both apps import this package from its build output, and `main` and `types` point into `dist/`.
That is why `npm run build:shared` is not optional on a fresh clone, and why the root `pretest`
hook rebuilds it before every test run.

| Path | What it is |
|---|---|
| `src/schemas/trade.ts` | `trade_schema`, the canonical model, with the create, amend, cancel, query and list shapes derived from it |
| `src/schemas/trade_event.ts` | The audit event, its query and list shapes, and the change set an amendment records |
| `src/schemas/position.ts` | The position row the server computes and broadcasts |
| `src/schemas/auth.ts` | The login request, the published user and the session |
| `src/schemas/problem.ts` | The problem detail shape every error returns, the stable error codes and the validation detail |
| `src/schemas/broadcast.ts` | The socket envelopes: trade events, positions and the mark set |
| `src/reference/instruments.ts` | The instruments, each with its currency and reference price |
| `src/reference/counterparties.ts` | The counterparties the ticket offers |
| `src/reference/roles.ts` | `VIEWER`, `TRADER` and `ADMIN`, and the permissions each one carries |
| `src/positions/position_book.ts` | Average cost, realised and unrealised P&L: one walk the server runs after every write and the client reuses |
| `src/events/socket_events.ts` | The typed server-to-client and client-to-server event map |
| `src/index.ts` | The barrel. Both apps import from the package root, never a deep path |

## Rules this package keeps

**One schema per model.** `trade_schema` is the only place a trade's fields are declared, and
every other trade shape is derived from it. A hand-written per-endpoint shape would drift from the
model on the first change.

**Field names are camelCase.** The brief supplies its sample payloads that way, so a reviewer
comparing a response against their own sample sees identical keys. Database columns stay
snake_case, bridged by Prisma's `@map`.

**A validation message is the sentence a trader reads.** The ticket and the API's 422 quote the
same string, because two wordings for one rule is two things to keep true.

`npm test` runs the tier with vitest: 60 tests across 5 files. Tests sit beside what they cover as
`<subject>.test.ts`, and `tsconfig.json` keeps them out of `dist/`.
