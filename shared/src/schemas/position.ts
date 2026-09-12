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
});

/** A net position in one instrument, as it appears over the wire. */
export type Position = z.infer<typeof position_schema>;
