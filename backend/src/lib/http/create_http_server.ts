import { createServer, type RequestListener, type Server } from 'node:http';

/** The HTTP server and the function that installs the app into its request slot. */
export interface ComposedHttpServer {
  server: Server;
  /** Installs the request handler. Requests that arrive before it is installed are answered 503. */
  serve: (listener: RequestListener) => void;
}

/**
 * Creates the HTTP server with its request handler registered before anything attaches to it.
 *
 * Socket.IO takes over the request listeners that exist when it attaches and passes every
 * non-socket request on to them. A handler added after it attaches is a second listener that also
 * answers socket requests, and two answers to one long-polling request crash the process with
 * `ERR_HTTP_HEADERS_SENT`. The app cannot exist yet when the socket server is built, because the
 * socket server feeds the broadcaster that the app's service needs, so the slot is registered now
 * and filled by `serve` later.
 *
 * @returns The server, with its request slot registered, and the function that fills the slot.
 */
export function create_http_server(): ComposedHttpServer {
  let handler: RequestListener | null = null;

  const server = createServer((req, res) => {
    if (handler === null) {
      res.statusCode = 503;
      res.end();
      return;
    }
    handler(req, res);
  });

  return {
    server,
    serve: (listener) => {
      handler = listener;
    },
  };
}
