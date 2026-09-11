import type { Trade, TradeSide, TradeStatus } from '@blotter/shared';

/**
 * A trade row as the database hands it back.
 *
 * Declared structurally rather than importing Prisma's generated model so the mapper, and the
 * tests around it, do not need a generated client to exist. Prisma's `TradeModel` satisfies this
 * shape, and `price` is described by the one method the mapper uses, so a `Decimal` and a test
 * double are equally acceptable.
 */
export interface TradeRow {
  id: string;
  tradeId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: { toNumber(): number };
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: Date;
  status: TradeStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Converts a database row into the trade shape the API and the socket both publish.
 *
 * Two conversions happen here and nowhere else. `price` is stored as `numeric(18,6)` so arithmetic
 * stays exact, and Prisma surfaces it as a `Decimal` object that would serialise to `{}` if it
 * reached `res.json` untouched, so it becomes a JSON number at this boundary to match the brief's
 * sample payload. Dates become ISO strings for the same reason: `trade_schema` says
 * `z.iso.datetime()`, and a `Date` would satisfy Express but not the client's parse.
 *
 * @param row - The row as read from the database.
 * @returns The trade in wire shape, valid against `trade_schema`.
 */
export function to_wire_trade(row: TradeRow): Trade {
  return {
    id: row.id,
    tradeId: row.tradeId,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price.toNumber(),
    trader: row.trader,
    book: row.book,
    counterparty: row.counterparty,
    tradeTimestamp: row.tradeTimestamp.toISOString(),
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
