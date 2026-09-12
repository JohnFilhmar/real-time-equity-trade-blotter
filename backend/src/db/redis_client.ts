import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../lib/logging/logger.js';

/**
 * The process-wide client, created on first use.
 *
 * Lazy on purpose. Connecting at import time would mean that merely importing anything that
 * reaches the rate limiter opens a socket, which makes a unit test depend on a running Redis to do
 * nothing with it. Nothing here connects until something actually needs Redis.
 */
let client: Redis | null = null;

/**
 * Returns the Redis connection, opening it the first time.
 *
 * Redis holds refresh token families and the rate-limit counters, which is to say it holds
 * sessions. `maxRetriesPerRequest: null` keeps commands queued through a blip rather than failing
 * every in-flight request the moment the connection drops.
 *
 * @returns The shared client.
 */
export function get_redis(): Redis {
  if (client !== null) {
    return client;
  }

  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  client.on('error', (error: unknown) => {
    logger.error({ err: error }, 'redis_error');
  });

  return client;
}

/**
 * Closes the connection if one was ever opened.
 *
 * @returns Resolves once Redis has been told to go away.
 */
export async function close_redis(): Promise<void> {
  if (client === null) {
    return;
  }

  await client.quit();
  client = null;
}
