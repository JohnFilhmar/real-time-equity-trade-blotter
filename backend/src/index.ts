import { createServer } from 'node:http';
import { create_app } from './app.js';
import { cors_origins, env, live_feed_options } from './config/env.js';
import { prisma } from './db/prisma_client.js';
import { create_live_feed } from './lib/live_feed/live_feed.js';
import { seed_trades_if_empty } from './lib/seed/seed_trades.js';
import { create_socket_broadcaster } from './realtime/socket_broadcaster.js';
import { create_socket_server } from './realtime/socket_server.js';
import { create_prisma_health_probe } from './repositories/prisma_health_probe.js';
import { create_prisma_trade_repository } from './repositories/prisma_trade_repository.js';
import { create_trade_service } from './services/trade_service.js';

// The HTTP server is created empty and the app attached afterwards, because the socket server
// needs the HTTP server, the broadcaster needs the socket server, the service needs the
// broadcaster, and the app needs the service. Building it in this order is what breaks that cycle.
const http_server = createServer();
const io = create_socket_server(http_server);

const trade_repository = create_prisma_trade_repository(prisma);
const trade_service = create_trade_service(trade_repository, create_socket_broadcaster(io));

const app = create_app({
  health_probe: create_prisma_health_probe(prisma),
  trade_service,
  cors_origins,
});
http_server.on('request', app);

const live_feed = create_live_feed(trade_service, trade_repository, live_feed_options);

/**
 * Stops the simulated feed, closes the socket server, the HTTP listener and the database pool, in
 * that order, so no request is cut mid-flight and no connection is left dangling.
 *
 * Without this, Docker's SIGTERM kills the process outright and `docker compose down` waits the
 * full ten seconds for SIGKILL on every stop.
 *
 * @param signal - The signal that triggered the shutdown, for the log line.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);

  const force_exit = setTimeout(() => {
    console.error('shutdown timed out, exiting');
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  force_exit.unref();

  try {
    live_feed.stop();
    await io.close();
    await new Promise<void>((resolve, reject) => {
      http_server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$disconnect();
    console.log('shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('shutdown failed', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (env.SEED_ON_STARTUP) {
    const inserted = await seed_trades_if_empty(prisma, env.SEED_TRADE_COUNT);
    if (inserted > 0) {
      console.log(`seeded ${inserted} trades`);
    }
  }

  http_server.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT.toString()}`);
  });

  if (env.LIVE_FEED_ENABLED) {
    live_feed.start();
    console.log(
      `live feed on, every ${live_feed_options.min_interval_ms.toString()} to ${live_feed_options.max_interval_ms.toString()} ms`,
    );
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((error: unknown) => {
  console.error('failed to start', error);
  process.exit(1);
});
