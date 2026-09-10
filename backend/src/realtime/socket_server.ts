import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@blotter/shared';
import { cors_origins } from '../config/env.js';

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
 * Attaches a typed Socket.IO server to an existing HTTP server.
 *
 * Socket.IO does not inherit the Express CORS middleware, so the same origin allowlist is applied
 * again here. Missing this is why a socket connects in development and fails under Docker.
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

  io.on('connection', (socket) => {
    socket.data.connected_at = new Date().toISOString();
  });

  return io;
}
