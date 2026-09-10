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

/** Query parameters accepted by the blotter listing. */
export const trade_query_schema = z.object({
  symbol: z.string().optional(),
  side: z.enum(trade_side_values).optional(),
  status: z.enum(trade_status_values).optional(),
  trader: z.string().optional(),
  book: z.string().optional(),
  sort_by: z.enum(['tradeTimestamp', 'symbol', 'quantity', 'price', 'trader']).default('tradeTimestamp'),
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

/** A trade side. */
export type TradeSide = (typeof trade_side_values)[number];

/** A trade status. */
export type TradeStatus = (typeof trade_status_values)[number];
