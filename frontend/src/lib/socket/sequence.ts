/**
 * Whether a broadcast is the one the stream should deliver next.
 *
 * Trades, audit events and positions share one server-side sequence, so the client can tell a
 * missed broadcast from a busy one. The first broadcast after a resync is accepted whatever its
 * number, because the resync already replaced everything the cache held.
 *
 * @param last_seq - The last sequence number applied, or `null` since the last resync.
 * @param seq - The sequence number of the broadcast in hand.
 * @returns True when `seq` follows `last_seq` directly. False on a skipped number, a repeat, or a
 * counter that went backwards because the server restarted; each means the cache can no longer be
 * trusted to converge on its own.
 */
export function is_next_in_sequence(last_seq: number | null, seq: number): boolean {
  return last_seq === null || seq === last_seq + 1;
}

/**
 * Orders one frame's broadcasts by sequence number, so they apply in the order the server emitted
 * them whatever order the transport delivered them in.
 *
 * @param batch - The broadcasts queued since the last frame.
 * @returns A new array, ascending by `envelope.seq`. The sort is stable, so equal numbers keep
 * their arrival order.
 */
export function order_by_seq<T extends { envelope: { seq: number } }>(batch: readonly T[]): T[] {
  return [...batch].sort((a, b) => a.envelope.seq - b.envelope.seq);
}
