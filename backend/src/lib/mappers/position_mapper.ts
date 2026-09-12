import type { Currency, Position } from '@blotter/shared';

/**
 * A position row as the aggregate query hands it back.
 *
 * The integer columns are cast to `int` in the SQL, because Postgres widens a summed integer to
 * `bigint` and Prisma would surface that as a `BigInt`. The notional is a summed `numeric`, which
 * Prisma surfaces as a `Decimal`, described here by the one method the mapper uses so a test
 * double is as acceptable as the real thing.
 */
export interface PositionRow {
  symbol: string;
  currency: Currency;
  buyQuantity: number;
  sellQuantity: number;
  grossNotional: { toNumber(): number };
  tradeCount: number;
}

/**
 * Converts an aggregate row into the position shape the API publishes.
 *
 * The notional becomes a JSON number here the same way, and with the same rounding, as the trade
 * mapper's price: `Decimal.toNumber()` and nothing else. The net quantity is derived from the two
 * sides rather than summed separately, so the three quantities cannot disagree with each other.
 *
 * @param row - The row as read from the database.
 * @returns The position in wire shape, valid against `position_schema`.
 */
export function to_wire_position(row: PositionRow): Position {
  return {
    symbol: row.symbol,
    currency: row.currency,
    netQuantity: row.buyQuantity - row.sellQuantity,
    buyQuantity: row.buyQuantity,
    sellQuantity: row.sellQuantity,
    grossNotional: row.grossNotional.toNumber(),
    tradeCount: row.tradeCount,
  };
}
