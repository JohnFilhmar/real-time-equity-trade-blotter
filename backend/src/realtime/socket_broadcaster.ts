import { trade_events } from '@blotter/shared';
import type { Trade } from '@blotter/shared';
import type { TradeBroadcaster } from '../interfaces/trade_broadcaster.js';
import type { BlotterSocketServer } from './socket_server.js';

/**
 * Adapts the Socket.IO server to the {@link TradeBroadcaster} port.
 *
 * The whole row is emitted rather than a patch, so a client that missed an earlier event still
 * ends up with the correct trade instead of applying a delta to a stale row.
 *
 * Every trade goes to every connected client today. Rooms are the natural place to scope this per
 * book later, which is one of the reasons Socket.IO was chosen over a bare WebSocket.
 *
 * @param io - The typed Socket.IO server.
 * @returns A broadcaster the service can depend on without knowing the transport.
 */
export function create_socket_broadcaster(io: BlotterSocketServer): TradeBroadcaster {
  return {
    trade_created(trade: Trade): void {
      io.emit(trade_events.created, trade);
    },

    trade_amended(trade: Trade): void {
      io.emit(trade_events.amended, trade);
    },

    trade_cancelled(trade: Trade): void {
      io.emit(trade_events.cancelled, trade);
    },
  };
}
