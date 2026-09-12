import { trade_events, type BroadcastEnvelope, type Trade } from '@blotter/shared';
import type { TradeBroadcaster } from '../interfaces/trade_broadcaster.js';
import { broadcast_lag_seconds, broadcasts_emitted } from '../lib/metrics/socket_metrics.js';
import type { BlotterSocketServer } from './socket_server.js';

/**
 * Adapts the Socket.IO server to the {@link TradeBroadcaster} port.
 *
 * The whole row is emitted rather than a patch, so a client that missed an earlier event still
 * ends up with the correct trade instead of applying a delta to a stale row. It travels inside an
 * envelope carrying a monotonic `seq`, so a client that sees 41 then 43 knows to refetch instead of
 * silently diverging, and an `emitted_at` stamp, which is what makes broadcast lag measurable.
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
   * Wraps a trade, stamps it, records the lag, and emits.
   *
   * @param event - The event name to emit under.
   * @param trade - The trade that changed.
   */
  function emit(event: (typeof trade_events)[keyof typeof trade_events], trade: Trade): void {
    seq += 1;
    const emitted_at = new Date();

    const envelope: BroadcastEnvelope = {
      seq,
      emitted_at: emitted_at.toISOString(),
      trade,
    };

    // updatedAt is set by the database at commit, so this distance is the real time between the
    // change becoming true and a client being able to see it.
    const lag_ms = emitted_at.getTime() - Date.parse(trade.updatedAt);
    broadcast_lag_seconds.observe({ event }, Math.max(lag_ms, 0) / 1000);
    broadcasts_emitted.inc({ event });

    io.emit(event, envelope);
  }

  return {
    trade_created(trade: Trade): void {
      emit(trade_events.created, trade);
    },

    trade_amended(trade: Trade): void {
      emit(trade_events.amended, trade);
    },

    trade_cancelled(trade: Trade): void {
      emit(trade_events.cancelled, trade);
    },
  };
}
