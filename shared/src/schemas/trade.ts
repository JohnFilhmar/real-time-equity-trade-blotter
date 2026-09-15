import { z } from 'zod';
import { currency_values, instrument_symbols } from '../reference/instruments.js';

/** The two sides a trade can be executed on. */
export const trade_side_values = ['BUY', 'SELL'] as const;

/**
 * The two states a trade can hold.
 *
 * Amending a trade is deliberately not a status: it increments `version` and writes an audit row,
 * which keeps the state machine to the two values the brief specifies.
 */
export const trade_status_values = ['ACTIVE', 'CANCELLED'] as const;

/** Business identifier pattern, matching the `TRD-100001` form in the brief's sample data. */
export const trade_id_pattern = /^TRD-\d{6,}$/;

/**
 * How far ahead of the server's clock a trade timestamp may sit.
 *
 * A trade cannot execute in the future, but a client whose clock is a little fast is a normal
 * condition rather than an error, so the bound allows a minute of skew and refuses anything past
 * it. Without any bound a trade books in 2074.
 */
export const future_timestamp_tolerance_ms = 60_000;

/**
 * The canonical trade model. Every other trade shape in the codebase is derived from this one,
 * so a field added here reaches the API contract, the client types and the validation together.
 *
 * Field names are camelCase because the brief supplies the payload that way and a reviewer
 * comparing a response against their own sample should see identical keys. Database columns are
 * snake_case, bridged by Prisma's `@map`.
 *
 * Every rule a client can break carries the sentence a trader reads, so the ticket and the API's
 * 422 say the same thing. A quantity or price that is absent or not a number asks for one rather
 * than quoting a range, because that is what an emptied box means to the person who emptied it.
 * Response-only fields keep the library's wording, since no client sends them.
 */
export const trade_schema = z.object({
  id: z.uuid(),
  tradeId: z.string().regex(trade_id_pattern),
  symbol: z.enum(instrument_symbols, 'Choose a symbol from the list'),
  side: z.enum(trade_side_values, 'Choose Buy or Sell'),
  quantity: z
    .int({
      // Stops at the first failure. Without it, a number too large to be a safe integer would also
      // fail the cap below and report the same thing twice.
      abort: true,
      error: (issue) => {
        if (typeof issue.input !== 'number' || !Number.isFinite(issue.input)) {
          return 'Enter a quantity';
        }
        return issue.input > 10_000_000
          ? 'Quantity cannot be more than 10,000,000'
          : 'Quantity must be a whole number above zero';
      },
    })
    .positive('Quantity must be a whole number above zero')
    .max(10_000_000, 'Quantity cannot be more than 10,000,000'),
  price: z
    .number('Enter a price')
    .positive('Price must be above zero')
    .max(10_000_000, 'Price cannot be more than 10,000,000'),
  currency: z.enum(currency_values),
  trader: z
    .string('Trader code must be 1 to 32 characters')
    .trim()
    .min(1, 'Trader code must be 1 to 32 characters')
    .max(32, 'Trader code must be 1 to 32 characters'),
  book: z
    .string('Enter a book')
    .trim()
    .min(1, 'Enter a book')
    .max(64, 'Book cannot be longer than 64 characters'),
  counterparty: z
    .string('Enter a counterparty')
    .trim()
    .min(1, 'Enter a counterparty')
    .max(128, 'Counterparty cannot be longer than 128 characters'),
  tradeTimestamp: z.iso.datetime('Enter the trade time as a valid date and time'),
  status: z.enum(trade_status_values),
  version: z.int('Reload the trade and try again').positive('Reload the trade and try again'),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Inbound shape for creating a trade.
 *
 * The server owns `id`, `tradeId`, `status`, `version` and the row timestamps, so a client cannot
 * set them. `currency` is server-owned too: it is a property of the instrument, not of the ticket,
 * so letting a client send it would allow a trade whose currency disagrees with its own symbol.
 *
 * `trader` is server-owned for the same reason once there is authentication: you book as yourself.
 * It comes from the access token, so a client cannot book under another desk code, and the trade's
 * trader and its audit actor are guaranteed to agree. This is a deliberate divergence from the
 * brief's sample payload, which shows trader as a client field.
 *
 * The future-time rule judges only a timestamp it can read. An unreadable one has already failed
 * the datetime rule, and reporting it as in the future too would put two messages on one box.
 */
export const create_trade_schema = trade_schema
  .omit({
    id: true,
    tradeId: true,
    currency: true,
    trader: true,
    status: true,
    version: true,
    createdAt: true,
    updatedAt: true,
  })
  .refine(
    (trade) => {
      const executed_at = Date.parse(trade.tradeTimestamp);
      return Number.isNaN(executed_at) || executed_at <= Date.now() + future_timestamp_tolerance_ms;
    },
    { error: 'Trade time cannot be in the future', path: ['tradeTimestamp'] },
  );

/**
 * The fields an amendment may change: quantity, price and book.
 *
 * Deliberately narrower than the create payload. Moving a trade to a different symbol or
 * counterparty, or flipping its side, is a rebooking rather than an amendment, and changing the
 * execution time rewrites when the trade happened. A desk that booked against the wrong
 * counterparty cancels the trade and books it again, so both trades stay on the record. The
 * economic terms and the book are what a desk genuinely corrects on trade date.
 */
export const amendable_trade_schema = trade_schema.pick({
  quantity: true,
  price: true,
  book: true,
});

/**
 * Inbound shape for amending a trade. Every field is optional except `version`, which the client
 * echoes back so a concurrent amendment is rejected rather than silently overwritten.
 *
 * `counterparty` is declared only to refuse it. Left undeclared it would be dropped like any
 * unknown key, and the caller would get a 200 for a trade whose counterparty never moved.
 */
export const amend_trade_schema = amendable_trade_schema.partial().extend({
  version: trade_schema.shape.version,
  counterparty: z
    .never('Counterparty cannot be changed on an amendment. Cancel the trade and book it again.')
    .optional(),
});

/**
 * Every column the blotter can sort on.
 *
 * This is deliberately the full set of columns the grid displays. A sortable-looking header that
 * the API rejects is worse than no sorting at all, so the two lists are kept the same length.
 */
export const trade_sort_columns = [
  'tradeId',
  'symbol',
  'side',
  'quantity',
  'price',
  'trader',
  'book',
  'counterparty',
  'tradeTimestamp',
  'status',
] as const;

/** Query parameters accepted by the blotter listing. */
export const trade_query_schema = z.object({
  symbol: z.string().optional(),
  side: z.enum(trade_side_values).optional(),
  status: z.enum(trade_status_values).optional(),
  trader: z.string().optional(),
  book: z.string().optional(),
  counterparty: z.string().optional(),
  date_from: z.iso.datetime().optional(),
  date_to: z.iso.datetime().optional(),
  sort_by: z.enum(trade_sort_columns).default('tradeTimestamp'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  /**
   * Opaque position marker from a previous page's `next_cursor`.
   *
   * Keyset rather than offset: the blotter inserts rows all day, so an offset computed on one
   * request no longer points at the same place on the next, which makes page two re-serve rows
   * already seen and skip others. A cursor names a row, so inserts above it change nothing.
   */
  cursor: z.string().optional(),
});

/**
 * Envelope returned by the blotter listing.
 *
 * The rows alone cannot tell the grid whether it is holding the last page or how many trades the
 * current filters match, so the total and the window that produced it travel with them.
 * `next_cursor` is null on the last page.
 */
export const trade_list_schema = z.object({
  data: z.array(trade_schema),
  total: z.int().nonnegative(),
  limit: z.int().positive(),
  next_cursor: z.string().nullable(),
});

/**
 * Inbound shape for cancelling a trade.
 *
 * `version` is optional: a client holding the row echoes it back and gets a conflict rather than
 * cancelling something it has not seen, while a client cancelling blind is still allowed to.
 */
export const cancel_trade_schema = z.object({
  version: z.int().positive().optional(),
});

/** A trade as it appears over the wire and in the client. */
export type Trade = z.infer<typeof trade_schema>;

/** Payload accepted by the create-trade endpoint. */
export type CreateTrade = z.infer<typeof create_trade_schema>;

/** The fields an amendment is permitted to touch. */
export type AmendableTrade = z.infer<typeof amendable_trade_schema>;

/** Payload accepted by the amend-trade endpoint. */
export type AmendTrade = z.infer<typeof amend_trade_schema>;

/** Parsed and defaulted blotter query parameters. */
export type TradeQuery = z.infer<typeof trade_query_schema>;

/** A page of trades plus the count of everything matching the same filters. */
export type TradeList = z.infer<typeof trade_list_schema>;

/** Payload accepted by the cancel-trade endpoint. */
export type CancelTrade = z.infer<typeof cancel_trade_schema>;

/** A column the blotter can sort on. */
export type TradeSortColumn = (typeof trade_sort_columns)[number];

/** A trade side. */
export type TradeSide = (typeof trade_side_values)[number];

/** A trade status. */
export type TradeStatus = (typeof trade_status_values)[number];
