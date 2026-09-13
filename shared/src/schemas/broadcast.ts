import { z } from 'zod';
import { position_schema } from './position.js';
import { trade_schema } from './trade.js';
import { trade_event_schema } from './trade_event.js';

/**
 * The envelope every broadcast travels in.
 *
 * A bare entity tells a client what changed but never that something was missed. `seq` is a
 * monotonic counter for the life of a server process, so a client that sees 41 then 43 knows to
 * refetch rather than quietly diverge. `emitted_at` is stamped at emit, which is also what makes
 * broadcast lag measurable: it is the distance between the write committing and this value.
 *
 * The trade sits inside untouched, so the entity schema stays the one canonical model and does not
 * grow transport fields that would be meaningless on a `GET`.
 */
export const broadcast_envelope_schema = z.object({
  seq: z.int().nonnegative(),
  emitted_at: z.iso.datetime(),
  trade: trade_schema,
});

/**
 * The envelope an audit event travels in.
 *
 * Shares the one sequence with trade broadcasts, so a client keeps a single gap check across
 * everything the server emits. The event is the same row the audit endpoints serve, so a client
 * that receives it can place it in the feed and in the trade's history without a fetch.
 */
export const trade_event_envelope_schema = z.object({
  seq: z.int().nonnegative(),
  emitted_at: z.iso.datetime(),
  event: trade_event_schema,
});

/**
 * The envelope a recomputed position travels in.
 *
 * The server recomputes one symbol after every write and sends the whole row, so a client never
 * derives a position from a broadcast it might have applied out of order. Same sequence as above.
 */
export const position_envelope_schema = z.object({
  seq: z.int().nonnegative(),
  emitted_at: z.iso.datetime(),
  position: position_schema,
});

/**
 * One mark per symbol, the whole set in one payload.
 *
 * Marks are transient market data and idempotent snapshots: a missed one is superseded by the
 * next, so they travel without a sequence.
 */
export const mark_set_schema = z.record(z.string(), z.number().positive());

/** A broadcast, carrying its position in the stream alongside the trade. */
export type BroadcastEnvelope = z.infer<typeof broadcast_envelope_schema>;

/** An audit event broadcast. */
export type TradeEventEnvelope = z.infer<typeof trade_event_envelope_schema>;

/** A position broadcast. */
export type PositionEnvelope = z.infer<typeof position_envelope_schema>;

/** The current mark for every symbol, keyed by symbol. */
export type MarkSet = z.infer<typeof mark_set_schema>;
