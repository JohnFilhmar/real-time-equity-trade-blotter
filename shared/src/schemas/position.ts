import { z } from 'zod';
import { currency_values, instrument_symbols } from '../reference/instruments.js';

/**
 * The blotter's net position in one instrument, built from its `ACTIVE` trades only.
 *
 * A cancelled trade never traded, so it contributes nothing here, which is the reason cancel is a
 * status rather than a delete: the position and the audit trail can both be right at once.
 *
 * `grossNotional` is the sum of `quantity * price` over the counted trades, in the instrument's
 * own quote currency. A London name therefore reports pence, not pounds, and the `currency` field
 * is what tells a reader which scale they are looking at.
 *
 * `averagePrice` and `realisedPnl` come from an average-cost walk over the trades in execution
 * order: a trade that adds to the position moves the average, a trade that closes against it
 * realises the difference. The walk lives once, in `positions/position_book.ts`, and both the
 * server and the client run the same code. Unrealised P&L is not here: it needs a mark, which
 * arrives over the socket, and the client multiplies as marks move.
 */
export const position_schema = z.object({
  symbol: z.enum(instrument_symbols),
  currency: z.enum(currency_values),
  /** `buyQuantity` minus `sellQuantity`. Negative when the book is net short. */
  netQuantity: z.int(),
  buyQuantity: z.int().nonnegative(),
  sellQuantity: z.int().nonnegative(),
  grossNotional: z.number().nonnegative(),
  tradeCount: z.int().nonnegative(),
  /** Average cost of the open position, in the quote currency. Zero when flat. */
  averagePrice: z.number().nonnegative(),
  /** P&L realised by trades that closed against an opposing position, in the quote currency. */
  realisedPnl: z.number(),
});

/** A net position in one instrument, as it appears over the wire. */
export type Position = z.infer<typeof position_schema>;
