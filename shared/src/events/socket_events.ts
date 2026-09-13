import type {
  BroadcastEnvelope,
  MarkSet,
  PositionEnvelope,
  TradeEventEnvelope,
} from '../schemas/broadcast.js';
import type { Role } from '../reference/roles.js';

/**
 * Event names broadcast by the API. Declared once so the server cannot emit a name the client
 * never listens for.
 */
export const trade_events = {
  created: 'trade.created',
  amended: 'trade.amended',
  cancelled: 'trade.cancelled',
  event_recorded: 'trade_event.recorded',
  position_updated: 'position.updated',
  mark_updated: 'mark.updated',
} as const;

/**
 * Events the server sends to connected blotter clients.
 *
 * Trade, audit and position broadcasts each carry an envelope on one shared sequence, so a client
 * can tell it missed one whatever kind it was. The whole row travels inside rather than a patch,
 * so a client that did miss one still converges on the correct state once it refetches. Marks are
 * idempotent snapshots and travel bare.
 */
export interface ServerToClientEvents {
  'trade.created': (event: BroadcastEnvelope) => void;
  'trade.amended': (event: BroadcastEnvelope) => void;
  'trade.cancelled': (event: BroadcastEnvelope) => void;
  'trade_event.recorded': (event: TradeEventEnvelope) => void;
  'position.updated': (event: PositionEnvelope) => void;
  'mark.updated': (marks: MarkSet) => void;
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
