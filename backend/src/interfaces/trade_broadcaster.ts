import type { MarkSet, Position, Trade, TradeEvent } from '@blotter/shared';

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

  /**
   * Announces the audit row an amendment or cancellation wrote, so a client can place it in the
   * event feed without a fetch.
   *
   * @param event - The event row, in wire shape.
   */
  trade_event_recorded(event: TradeEvent): void;

  /**
   * Announces one symbol's recomputed position after a write, the whole row rather than a delta.
   *
   * @param position - The position after the write, in wire shape.
   */
  position_updated(position: Position): void;

  /**
   * Announces the current mark for every symbol. Idempotent, so it travels without an envelope.
   *
   * @param marks - The whole mark set, keyed by symbol.
   */
  marks_updated(marks: MarkSet): void;
}
