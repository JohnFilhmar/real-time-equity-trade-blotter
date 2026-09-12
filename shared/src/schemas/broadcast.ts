import { z } from 'zod';
import { trade_schema } from './trade.js';

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

/** A broadcast, carrying its position in the stream alongside the trade. */
export type BroadcastEnvelope = z.infer<typeof broadcast_envelope_schema>;
