import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import {
  role_has,
  trade_events,
  type ClientToServerEvents,
  type MarkSet,
  type ServerToClientEvents,
  type SocketData,
} from '@blotter/shared';
import { cors_origins } from '../config/env.js';
import { verify_access_token } from '../lib/auth/tokens.js';
import { logger } from '../lib/logging/logger.js';
import { connected_clients, rejected_connections } from '../lib/metrics/socket_metrics.js';

/** Inter-server events. Unused with a single node, declared so the generic stays explicit. */
interface InterServerEvents {
  ping: () => void;
}

/** The blotter's Socket.IO server, typed so an unknown event name will not compile. */
export type BlotterSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Decides whether a handshake's Origin is allowed.
 *
 * A connection with no Origin header at all is permitted: that is a server-side client, a CLI or a
 * test, none of which a browser-origin policy is about. The check exists to stop a page on another
 * site from opening a socket, and such a page always sends an Origin.
 *
 * @param origin - The Origin header from the handshake, if any.
 * @returns True when the connection may proceed.
 */
function is_allowed_origin(origin: string | undefined): boolean {
  return origin === undefined || cors_origins.includes(origin);
}

/**
 * Pulls the access token out of a handshake.
 *
 * Socket.IO clients put credentials in `auth`, so that is the first place to look. The
 * Authorization header is accepted as well, because a non-browser client already has one and
 * making it invent a second convention buys nothing.
 *
 * @param auth - The handshake's `auth` object.
 * @param header - The handshake's Authorization header, if any.
 * @returns The token, or `undefined`.
 */
function handshake_token(auth: Record<string, unknown>, header: string | undefined): string | undefined {
  const supplied = auth.token;

  if (typeof supplied === 'string' && supplied.length > 0) {
    return supplied;
  }

  const [scheme, token] = (header ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token !== undefined && token.length > 0
    ? token
    : undefined;
}

/**
 * Attaches a typed Socket.IO server to an existing HTTP server.
 *
 * Three checks run on every handshake, and they cover different things.
 *
 * The `cors` option governs the HTTP long-polling handshake, which is a normal cross-origin
 * request. The Origin middleware governs the WebSocket upgrade, which is not subject to CORS at
 * all: a browser will happily open a WebSocket to any host, so without it the allowlist protects
 * only the transport nobody ends up using.
 *
 * The token check is the one that matters most. Broadcasts carry whole trades, so an
 * unauthenticated socket would stream the entire blotter to anyone who opened one, and the
 * authorisation on the read endpoints would be decorative.
 *
 * A client that passes all three is sent the current marks straight away, so it can price its
 * positions before the first tick of the mark feed arrives.
 *
 * @param http_server - The server Express is already listening on, so both share one port.
 * @param marks - Where the current mark set is read from on each connection.
 * @returns The typed Socket.IO server.
 */
export function create_socket_server(
  http_server: HttpServer,
  marks: { current(): MarkSet },
): BlotterSocketServer {
  const io: BlotterSocketServer = new Server(http_server, {
    cors: {
      origin: [...cors_origins],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;

    if (!is_allowed_origin(origin)) {
      rejected_connections.inc();
      logger.warn({ origin }, 'socket_origin_rejected');
      next(new Error('origin not allowed'));
      return;
    }

    const token = handshake_token(socket.handshake.auth, socket.handshake.headers.authorization);
    const claims = token === undefined ? null : verify_access_token(token);

    if (claims === null) {
      rejected_connections.inc();
      next(new Error('authentication required'));
      return;
    }

    if (!role_has(claims.role, 'trade.read')) {
      rejected_connections.inc();
      next(new Error('not permitted'));
      return;
    }

    socket.data.user_id = claims.sub;
    socket.data.trader_code = claims.trader_code;
    socket.data.role = claims.role;
    next();
  });

  io.on('connection', (socket) => {
    socket.data.connected_at = new Date().toISOString();
    connected_clients.inc();
    socket.emit(trade_events.mark_updated, marks.current());

    socket.on('disconnect', () => {
      connected_clients.dec();
    });
  });

  return io;
}
