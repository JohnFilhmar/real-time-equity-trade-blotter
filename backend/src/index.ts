import { createServer } from 'node:http';
import { create_app } from './app.js';
import { cors_origins, env } from './config/env.js';
import { prisma } from './db/prisma_client.js';
import { create_socket_server } from './realtime/socket_server.js';
import { create_prisma_health_probe } from './repositories/prisma_health_probe.js';
import { seed_trades_if_empty } from './lib/seed/seed_trades.js';

const app = create_app({
  health_probe: create_prisma_health_probe(prisma),
  cors_origins,
});
const http_server = createServer(app);
const io = create_socket_server(http_server);

/**
 * Closes the socket server, the HTTP listener and the database pool, in that order, so no request
 * is cut mid-flight and no connection is left dangling.
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
    console.log(`API listening on http://localhost:${env.PORT}`);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((error: unknown) => {
  console.error('failed to start', error);
  process.exit(1);
});
