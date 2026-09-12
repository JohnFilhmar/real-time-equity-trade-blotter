import { z } from 'zod';
import { trade_id_pattern } from './trade.js';

/**
 * What happened to the trade.
 *
 * Booking is not here: a trade's creation is the row itself, and duplicating it as an event would
 * mean two places claim to know when the trade was captured.
 */
export const trade_event_actions = ['AMENDED', 'CANCELLED'] as const;

/**
 * Where the change came in from.
 *
 * The simulated desk feed writes through the same service as a human request, which is what keeps
 * the two paths from drifting, and this column is what makes the two distinguishable afterwards.
 */
export const trade_event_sources = ['API', 'LIVE_FEED'] as const;

/**
 * One field's movement.
 *
 * Both sides are recorded rather than the new value alone, so reading the history never means
 * walking versions backwards to work out what the previous value was.
 */
export const trade_change_schema = z.object({
  from: z.union([z.string(), z.number()]),
  to: z.union([z.string(), z.number()]),
});

/** Every field that moved in one event, keyed by field name. */
export const trade_change_set_schema = z.record(z.string(), trade_change_schema);

/**
 * One entry in a trade's history, as it appears over the wire.
 *
 * Addressed by the business `tradeId` rather than the internal row uuid, matching every other
 * route, so a client never has to hold two identifiers for the same trade. A cancellation records
 * its status transition in `changes` like any other movement, so a reader does not need a second
 * shape to understand one.
 */
export const trade_event_schema = z.object({
  id: z.uuid(),
  tradeId: z.string().regex(trade_id_pattern),
  version: z.int().positive(),
  action: z.enum(trade_event_actions),
  source: z.enum(trade_event_sources),
  changes: trade_change_set_schema,
  actor: z.string().min(1).max(32),
  occurredAt: z.iso.datetime(),
});

/**
 * Query parameters accepted by the global event feed.
 *
 * Keyset rather than offset, for the same reason as the blotter listing: the feed grows every few
 * seconds, so an offset computed on one request points somewhere else on the next. The page is
 * capped at 500 because the feed is read newest first and a client that wants more is catching up,
 * not browsing.
 */
export const trade_event_query_schema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

/**
 * Envelope returned by the global event feed.
 *
 * Deliberately the same shape as `trade_list_schema`, so a client that already pages the blotter
 * pages the feed with the same code. `next_cursor` is null on the last page.
 */
export const trade_event_list_schema = z.object({
  data: z.array(trade_event_schema),
  total: z.int().nonnegative(),
  limit: z.int().positive(),
  next_cursor: z.string().nullable(),
});

/** One field's movement in an event. */
export type TradeChange = z.infer<typeof trade_change_schema>;

/** Every field that moved in one event. */
export type TradeChangeSet = z.infer<typeof trade_change_set_schema>;

/** One entry in a trade's history. */
export type TradeEvent = z.infer<typeof trade_event_schema>;

/** Parsed and defaulted global event feed query parameters. */
export type TradeEventQuery = z.infer<typeof trade_event_query_schema>;

/** A page of the global event feed plus the count of every event in it. */
export type TradeEventList = z.infer<typeof trade_event_list_schema>;

/** What happened to the trade. */
export type TradeEventAction = (typeof trade_event_actions)[number];

/** Where the change came in from. */
export type TradeEventSource = (typeof trade_event_sources)[number];
