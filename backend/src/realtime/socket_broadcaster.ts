import {
  trade_events,
  type BroadcastEnvelope,
  type MarkSet,
  type Position,
  type PositionEnvelope,
  type Trade,
  type TradeEvent,
  type TradeEventEnvelope,
} from '@blotter/shared';
import type { TradeBroadcaster } from '../interfaces/trade_broadcaster.js';
import { broadcast_lag_seconds, broadcasts_emitted } from '../lib/metrics/socket_metrics.js';
import type { BlotterSocketServer } from './socket_server.js';

/** The three event names that carry a trade envelope. */
type TradeBroadcastName =
  | typeof trade_events.created
  | typeof trade_events.amended
  | typeof trade_events.cancelled;

/**
 * Adapts the Socket.IO server to the {@link TradeBroadcaster} port.
 *
 * The whole row is emitted rather than a patch, so a client that missed an earlier event still
 * ends up with the correct trade instead of applying a delta to a stale row. It travels inside an
 * envelope carrying a monotonic `seq`, so a client that sees 41 then 43 knows to refetch instead of
 * silently diverging, and an `emitted_at` stamp, which is what makes broadcast lag measurable.
 *
 * Trades, audit events and positions share the one sequence, so a client keeps a single gap check
 * across everything the server emits. Marks are idempotent snapshots and go out bare.
 *
 * The sequence restarts at 1 when the process does. That is deliberate and has to be: a client
 * cannot tell a restart from a gap on sequence alone, which is why the resync path exists on the
 * client rather than a guarantee being claimed here.
 *
 * Every trade goes to every connected client today. Rooms are the natural place to scope this per
 * book later, which is one of the reasons Socket.IO was chosen over a bare WebSocket.
 *
 * @param io - The typed Socket.IO server.
 * @returns A broadcaster the service can depend on without knowing the transport.
 */
export function create_socket_broadcaster(io: BlotterSocketServer): TradeBroadcaster {
  let seq = 0;

  /**
   * Advances the shared sequence and stamps the moment, for every envelope kind alike.
   *
   * @returns The next sequence number and the emit time.
   */
  function stamp(): { seq: number; emitted_at: string } {
    seq += 1;
    return { seq, emitted_at: new Date().toISOString() };
  }

  /**
   * Records how long a committed change took to reach the wire.
   *
   * @param event - The event name the observation is labelled with.
   * @param committed_at - When the database committed the change.
   * @param emitted_at - When the envelope was stamped.
   */
  function observe_lag(event: string, committed_at: string, emitted_at: string): void {
    // The commit time is set by the database, so this distance is the real time between the
    // change becoming true and a client being able to see it.
    const lag_ms = Date.parse(emitted_at) - Date.parse(committed_at);
    broadcast_lag_seconds.observe({ event }, Math.max(lag_ms, 0) / 1000);
  }

  /**
   * Wraps a trade, stamps it, records the lag, and emits.
   *
   * @param event - The event name to emit under.
   * @param trade - The trade that changed.
   */
  function emit_trade(event: TradeBroadcastName, trade: Trade): void {
    const envelope: BroadcastEnvelope = { ...stamp(), trade };

    observe_lag(event, trade.updatedAt, envelope.emitted_at);
    broadcasts_emitted.inc({ event });

    io.emit(event, envelope);
  }

  return {
    trade_created(trade: Trade): void {
      emit_trade(trade_events.created, trade);
    },

    trade_amended(trade: Trade): void {
      emit_trade(trade_events.amended, trade);
    },

    trade_cancelled(trade: Trade): void {
      emit_trade(trade_events.cancelled, trade);
    },

    trade_event_recorded(event: TradeEvent): void {
      const envelope: TradeEventEnvelope = { ...stamp(), event };

      observe_lag(trade_events.event_recorded, event.occurredAt, envelope.emitted_at);
      broadcasts_emitted.inc({ event: trade_events.event_recorded });

      io.emit(trade_events.event_recorded, envelope);
    },

    position_updated(position: Position): void {
      const envelope: PositionEnvelope = { ...stamp(), position };

      // A position is derived rather than committed, so it has no timestamp to measure lag from.
      broadcasts_emitted.inc({ event: trade_events.position_updated });

      io.emit(trade_events.position_updated, envelope);
    },

    marks_updated(marks: MarkSet): void {
      broadcasts_emitted.inc({ event: trade_events.mark_updated });

      io.emit(trade_events.mark_updated, marks);
    },
  };
}
