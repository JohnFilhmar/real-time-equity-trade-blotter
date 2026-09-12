import { createServer } from 'node:http';
import { create_app } from './app.js';
import { cors_origins, env, live_feed_options } from './config/env.js';
import { prisma } from './db/prisma_client.js';
import { close_redis, get_redis } from './db/redis_client.js';
import { create_login_attempts } from './lib/auth/login_attempts.js';
import { create_refresh_store } from './lib/auth/refresh_store.js';
import { create_live_feed } from './lib/live_feed/live_feed.js';
import { logger } from './lib/logging/logger.js';
import { seed_trades_if_empty } from './lib/seed/seed_trades.js';
import { seed_users_if_empty } from './lib/seed/seed_users.js';
import { create_socket_broadcaster } from './realtime/socket_broadcaster.js';
import { create_socket_server } from './realtime/socket_server.js';
import { create_prisma_health_probe } from './repositories/prisma_health_probe.js';
import { create_prisma_trade_repository } from './repositories/prisma_trade_repository/index.js';
import { create_prisma_user_repository } from './repositories/prisma_user_repository.js';
import { create_auth_service } from './services/auth_service.js';
import { create_trade_service } from './services/trade_service/index.js';

// The HTTP server is created empty and the app attached afterwards, because the socket server
// needs the HTTP server, the broadcaster needs the socket server, the service needs the
// broadcaster, and the app needs the service. Building it in this order is what breaks that cycle.
const http_server = createServer();
const io = create_socket_server(http_server);

const trade_repository = create_prisma_trade_repository(prisma);
const user_repository = create_prisma_user_repository(prisma);

const trade_service = create_trade_service(trade_repository, create_socket_broadcaster(io));
const redis = get_redis();
const auth_service = create_auth_service(
  user_repository,
  create_refresh_store(redis),
  create_login_attempts(redis),
);

const app = create_app({
  health_probe: create_prisma_health_probe(prisma),
  trade_service,
  auth_service,
  cors_origins,
});
http_server.on('request', app);

const live_feed = create_live_feed(trade_service, trade_repository, live_feed_options);

/**
 * Closes the HTTP listener, tolerating the case where Socket.IO has already closed it.
 *
 * `io.close()` also closes the HTTP server it was attached to, so by the time this runs the
 * listener is normally already down and node answers `ERR_SERVER_NOT_RUNNING`. That is the
 * expected path rather than a failure: treating it as one made every `docker compose stop` exit
 * the container with status 1.
 *
 * @returns Resolves once the listener is closed, or was already closed.
 */
function close_http_server(): Promise<void> {
  return new Promise((resolve, reject) => {
    http_server.close((error) => {
      const already_closed =
        error !== undefined && 'code' in error && error.code === 'ERR_SERVER_NOT_RUNNING';

      if (error === undefined || already_closed) {
        resolve();
        return;
      }

      reject(error);
    });
  });
}

/**
 * Stops the simulated feed, closes the socket server, the HTTP listener, Redis and the database
 * pool, in that order, so no request is cut mid-flight and no connection is left dangling.
 *
 * Without this, Docker's SIGTERM kills the process outright and `docker compose down` waits the
 * full ten seconds for SIGKILL on every stop.
 *
 * @param signal - The signal that triggered the shutdown, for the log line.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting_down');

  const force_exit = setTimeout(() => {
    logger.error('shutdown_timed_out');
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  force_exit.unref();

  try {
    live_feed.stop();
    await io.close();
    await close_http_server();
    await close_redis();
    await prisma.$disconnect();
    logger.info('shutdown_complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'shutdown_failed');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (env.SEED_ON_STARTUP) {
    const accounts = await seed_users_if_empty(user_repository);
    if (accounts > 0) {
      logger.info({ accounts }, 'seeded_users');
    }

    const inserted = await seed_trades_if_empty(prisma, env.SEED_TRADE_COUNT);
    if (inserted > 0) {
      logger.info({ inserted }, 'seeded_trades');
    }
  }

  http_server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'api_listening');
  });

  if (env.LIVE_FEED_ENABLED) {
    live_feed.start();
    logger.info(
      {
        min_interval_ms: live_feed_options.min_interval_ms,
        max_interval_ms: live_feed_options.max_interval_ms,
      },
      'live_feed_started',
    );
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((error: unknown) => {
  logger.error({ err: error }, 'failed_to_start');
  process.exit(1);
});
