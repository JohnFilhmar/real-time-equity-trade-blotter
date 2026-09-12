import type { BroadcastEnvelope } from '../schemas/broadcast.js';
import type { Role } from '../reference/roles.js';

/**
 * Event names broadcast by the API. Declared once so the server cannot emit a name the client
 * never listens for.
 */
export const trade_events = {
  created: 'trade.created',
  amended: 'trade.amended',
  cancelled: 'trade.cancelled',
} as const;

/**
 * Events the server sends to connected blotter clients.
 *
 * Each carries an envelope rather than a bare trade, so a client can tell it missed one. The whole
 * row travels inside rather than a patch, so a client that did miss one still converges on the
 * correct trade once it refetches.
 */
export interface ServerToClientEvents {
  'trade.created': (event: BroadcastEnvelope) => void;
  'trade.amended': (event: BroadcastEnvelope) => void;
  'trade.cancelled': (event: BroadcastEnvelope) => void;
}

/**
 * Events a client sends to the server.
 *
 * Empty by design: mutations travel over HTTP so they get the same validation, error handling and
 * rate limiting as any other write, and the socket carries broadcasts only.
 */
export interface ClientToServerEvents {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
}

/**
 * Per-socket state, set once the handshake has been authenticated.
 *
 * The socket carries the same identity as the HTTP requests beside it. Without that a client that
 * cannot read a trade over HTTP could still watch every trade arrive over the socket, which would
 * make the authorisation on the read endpoints decorative.
 */
export interface SocketData {
  connected_at: string;
  user_id: string;
  trader_code: string;
  role: Role;
}
