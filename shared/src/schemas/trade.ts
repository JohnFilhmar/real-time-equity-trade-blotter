import { z } from 'zod';

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
  symbol: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Z][A-Z.]*$/, 'symbol must be upper case ticker characters'),
  side: z.enum(trade_side_values),
  quantity: z.int().positive().max(10_000_000),
  price: z.number().positive().max(1_000_000),
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
 * set them.
 */
export const create_trade_schema = trade_schema.omit({
  id: true,
  tradeId: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Inbound shape for amending a trade. Every field is optional except `version`, which the client
 * echoes back so a concurrent amendment is rejected rather than silently overwritten.
 */
export const amend_trade_schema = create_trade_schema.partial().extend({
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

/** Query parameters accepted by the blotter listing. */
export const trade_query_schema = z.object({
  symbol: z.string().optional(),
  side: z.enum(trade_side_values).optional(),
  status: z.enum(trade_status_values).optional(),
  trader: z.string().optional(),
  book: z.string().optional(),
  counterparty: z.string().optional(),
  sort_by: z.enum(trade_sort_columns).default('tradeTimestamp'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** A trade as it appears over the wire and in the client. */
export type Trade = z.infer<typeof trade_schema>;

/** Payload accepted by the create-trade endpoint. */
export type CreateTrade = z.infer<typeof create_trade_schema>;

/** Payload accepted by the amend-trade endpoint. */
export type AmendTrade = z.infer<typeof amend_trade_schema>;

/** Parsed and defaulted blotter query parameters. */
export type TradeQuery = z.infer<typeof trade_query_schema>;

/** A column the blotter can sort on. */
export type TradeSortColumn = (typeof trade_sort_columns)[number];

/** A trade side. */
export type TradeSide = (typeof trade_side_values)[number];

/** A trade status. */
export type TradeStatus = (typeof trade_status_values)[number];

/**
 * Envelope returned by the blotter listing.
 *
 * The rows alone cannot tell the grid whether it is holding the last page or how many trades the
 * current filters match, so the total and the window that produced it travel with them.
 */
export const trade_list_schema = z.object({
  data: z.array(trade_schema),
  total: z.int().nonnegative(),
  limit: z.int().positive(),
  offset: z.int().nonnegative(),
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

/** A page of trades plus the count of everything matching the same filters. */
export type TradeList = z.infer<typeof trade_list_schema>;

/** Payload accepted by the cancel-trade endpoint. */
export type CancelTrade = z.infer<typeof cancel_trade_schema>;

/**
 * One field's movement in an amendment.
 *
 * Both sides are recorded rather than the new value alone, so reading the history never means
 * walking versions backwards to work out what the previous value was.
 */
export const trade_change_schema = z.object({
  from: z.union([z.string(), z.number()]),
  to: z.union([z.string(), z.number()]),
});

/** Every field that moved in one amendment, keyed by field name. */
export const trade_change_set_schema = z.record(z.string(), trade_change_schema);

/**
 * One amendment as it appears over the wire.
 *
 * Addressed by the business `tradeId` rather than the internal row uuid, matching every other
 * route, so a client never has to hold two identifiers for the same trade.
 */
export const trade_amendment_schema = z.object({
  id: z.uuid(),
  tradeId: z.string().regex(trade_id_pattern),
  version: z.int().positive(),
  changes: trade_change_set_schema,
  amendedBy: z.string().min(1).max(32),
  amendedAt: z.iso.datetime(),
});

/** One field's movement in an amendment. */
export type TradeChange = z.infer<typeof trade_change_schema>;

/** Every field that moved in one amendment. */
export type TradeChangeSet = z.infer<typeof trade_change_set_schema>;

/** One amendment, as returned by the history endpoint. */
export type TradeAmendment = z.infer<typeof trade_amendment_schema>;
