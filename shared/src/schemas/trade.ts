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
 */
export const trade_schema = z.object({
  id: z.uuid(),
  tradeId: z.string().regex(trade_id_pattern),
  symbol: z.enum(instrument_symbols),
  side: z.enum(trade_side_values),
  quantity: z.int().positive().max(10_000_000),
  price: z.number().positive().max(10_000_000),
  currency: z.enum(currency_values),
  trader: z.string().trim().min(1).max(32),
  book: z.string().trim().min(1).max(64),
  counterparty: z.string().trim().min(1).max(128),
  tradeTimestamp: z.iso.datetime(),
  status: z.enum(trade_status_values),
  version: z.int().positive(),
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
    (trade) =>
      Date.parse(trade.tradeTimestamp) <= Date.now() + future_timestamp_tolerance_ms,
    { message: 'tradeTimestamp cannot be in the future', path: ['tradeTimestamp'] },
  );

/**
 * The fields an amendment may change.
 *
 * Deliberately narrower than the create payload. Re-pointing a trade at a different symbol, or
 * flipping its side, is a rebooking rather than an amendment, and changing the execution time
 * rewrites when the trade happened. Those three are refused; the economic terms and the booking
 * details a desk genuinely corrects on trade date are allowed.
 */
export const amendable_trade_schema = trade_schema.pick({
  quantity: true,
  price: true,
  counterparty: true,
  book: true,
});

/**
 * Inbound shape for amending a trade. Every field is optional except `version`, which the client
 * echoes back so a concurrent amendment is rejected rather than silently overwritten.
 */
export const amend_trade_schema = amendable_trade_schema.partial().extend({
  version: z.int().positive(),
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

/** The refusal for a trade-date bound that is not a timestamp. */
const valid_timestamp_message = 'Enter a valid date and time';

/** The refusal for a page size outside the cap. */
const page_size_message = 'Page size must be a whole number from 1 to 1,000';

/**
 * Whether a trade-date range runs backwards.
 *
 * An end that is not a timestamp parses to `NaN`, which compares false, so a malformed end is left
 * to its own message instead of also being reported as out of order.
 *
 * @param date_from - The start of the range, or `undefined` when open.
 * @param date_to - The end of the range, or `undefined` when open.
 * @returns True only when both ends are set and From falls after To. Equal ends are a valid range.
 */
function is_reversed_range(date_from: string | undefined, date_to: string | undefined): boolean {
  return (
    date_from !== undefined && date_to !== undefined && Date.parse(date_from) > Date.parse(date_to)
  );
}

/**
 * Query parameters accepted by the blotter listing.
 *
 * Each refusal carries a plain-English message instead of zod's default, so a 422 and the blotter
 * word a problem the same way. A From later than To is refused on the From field rather than
 * answered with an empty page, which would read as "no trades" instead of as a mistake.
 *
 * zod refuses `.omit()`, `.pick()` and `.partial()` on an object carrying a cross-field check. A
 * client that needs part of this shape builds it from `.shape` and parses through this schema
 * first, so the range check still applies.
 */
export const trade_query_schema = z
  .object({
    symbol: z.string().optional(),
    side: z.enum(trade_side_values, { error: 'Side must be BUY or SELL' }).optional(),
    status: z.enum(trade_status_values, { error: 'Status must be ACTIVE or CANCELLED' }).optional(),
    trader: z.string().optional(),
    book: z.string().optional(),
    counterparty: z.string().optional(),
    date_from: z.iso.datetime({ error: valid_timestamp_message }).optional(),
    date_to: z.iso.datetime({ error: valid_timestamp_message }).optional(),
    sort_by: z
      .enum(trade_sort_columns, { error: "Sort by one of the blotter's columns" })
      .default('tradeTimestamp'),
    sort_dir: z
      .enum(['asc', 'desc'], { error: 'Sort direction must be asc or desc' })
      .default('desc'),
    limit: z.coerce
      .number({ error: page_size_message })
      .int({ error: page_size_message })
      .min(1, { error: page_size_message })
      .max(1000, { error: page_size_message })
      .default(100),
    /**
     * Opaque position marker from a previous page's `next_cursor`.
     *
     * Keyset rather than offset: the blotter inserts rows all day, so an offset computed on one
     * request no longer points at the same place on the next, which makes page two re-serve rows
     * already seen and skip others. A cursor names a row, so inserts above it change nothing.
     */
    cursor: z.string().optional(),
  })
  .refine((query) => !is_reversed_range(query.date_from, query.date_to), {
    path: ['date_from'],
    error: 'From must be on or before To',
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
