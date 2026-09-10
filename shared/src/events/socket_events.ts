import type { Trade } from '../schemas/trade.js';

/**
 * Event names broadcast by the API. Declared once so the server cannot emit a name the client
 * never listens for.
 */
export const trade_events = {
  created: 'trade.created',
  amended: 'trade.amended',
  cancelled: 'trade.cancelled',
} as const;

/** Events the server sends to connected blotter clients. */
export interface ServerToClientEvents {
  'trade.created': (trade: Trade) => void;
  'trade.amended': (trade: Trade) => void;
  'trade.cancelled': (trade: Trade) => void;
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

/** Per-socket state. Unused today, declared so the server generic stays explicit. */
export interface SocketData {
  connected_at: string;
}
