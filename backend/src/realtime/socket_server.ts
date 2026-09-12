import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@blotter/shared';
import { cors_origins } from '../config/env.js';
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
 * Attaches a typed Socket.IO server to an existing HTTP server.
 *
 * Two separate origin controls, because they cover different things. The `cors` option below
 * governs the HTTP long-polling handshake, which is a normal cross-origin request. The middleware
 * governs the WebSocket upgrade, which is not subject to CORS at all: a browser will happily open
 * a WebSocket to any host, so without this check the allowlist protects only the transport nobody
 * ends up using.
 *
 * @param http_server - The server Express is already listening on, so both share one port.
 * @returns The typed Socket.IO server.
 */
export function create_socket_server(http_server: HttpServer): BlotterSocketServer {
  const io: BlotterSocketServer = new Server(http_server, {
    cors: {
      origin: [...cors_origins],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;

    if (is_allowed_origin(origin)) {
      next();
      return;
    }

    rejected_connections.inc();
    logger.warn({ origin }, 'socket_origin_rejected');
    next(new Error('origin not allowed'));
  });

  io.on('connection', (socket) => {
    socket.data.connected_at = new Date().toISOString();
    connected_clients.inc();

    socket.on('disconnect', () => {
      connected_clients.dec();
    });
  });

  return io;
}
