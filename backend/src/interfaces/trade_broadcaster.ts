import type { Trade } from '@blotter/shared';

/**
 * The outbound side of real-time updates, as the service sees it.
 *
 * Declared as a port so the service can announce a change without importing Socket.IO, which keeps
 * the business rules testable with a recording double and leaves the transport swappable.
 *
 * Every method is fire-and-forget by design: a broadcast that fails must never fail the write that
 * was already committed.
 */
export interface TradeBroadcaster {
  /**
   * Announces a newly booked trade.
   *
   * @param trade - The stored trade, in wire shape.
   */
  trade_created(trade: Trade): void;

  /**
   * Announces an amended trade, carrying the full row so clients replace rather than patch.
   *
   * @param trade - The amended trade, in wire shape.
   */
  trade_amended(trade: Trade): void;

  /**
   * Announces a cancelled trade.
   *
   * @param trade - The cancelled trade, in wire shape.
   */
  trade_cancelled(trade: Trade): void;
}
