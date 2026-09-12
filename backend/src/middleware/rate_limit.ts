import rate_limit, { ipKeyGenerator, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, RequestHandler } from 'express';
import { problem_content_type, problem_type_for, type Problem } from '@blotter/shared';
import { env } from '../config/env.js';
import { get_redis } from '../db/redis_client.js';
import { error_codes } from '../lib/errors/app_error.js';
import { request_id_of } from '../lib/logging/logger.js';

/**
 * Sends one command to Redis on the rate limiter's behalf.
 *
 * `ioredis` types its generic `call` as returning `unknown`, which is honest: the reply shape
 * depends on the command. The limiter only ever issues commands that answer with a number, a
 * string, or an array of those, so the reply is narrowed here rather than asserted.
 *
 * @param args - The command and its arguments.
 * @returns The reply.
 * @throws {Error} When Redis answers with something the limiter cannot use.
 */
async function send_command(...args: string[]): Promise<number | string | (number | string)[]> {
  const [command, ...rest] = args;

  if (command === undefined) {
    throw new Error('rate limiter issued an empty Redis command');
  }

  const reply: unknown = await get_redis().call(command, ...rest);

  if (typeof reply === 'number' || typeof reply === 'string') {
    return reply;
  }

  if (Array.isArray(reply)) {
    return reply.filter(
      (entry): entry is number | string => typeof entry === 'number' || typeof entry === 'string',
    );
  }

  throw new Error(`Redis answered ${command} with an unusable reply`);
}

/**
 * Builds the store for one limiter.
 *
 * Redis rather than memory, because limits that live in a process are per replica, which means
 * they multiply by however many replicas are running and stop meaning anything.
 *
 * Under `NODE_ENV=test` the library's own in-process store is used instead. The limiting
 * behaviour is identical; what Redis adds is a counter shared across replicas, and that property
 * is what the integration tier exercises against a real server. Requiring a running Redis to run a
 * unit test would buy nothing and cost everything.
 *
 * @param prefix - Keeps each tier's counters separate.
 * @returns The store option, or an empty object so the library keeps its default.
 */
function store_for(prefix: string): { store: Store } | Record<string, never> {
  return env.NODE_ENV === 'test'
    ? {}
    : { store: new RedisStore({ prefix, sendCommand: send_command }) };
}

/**
 * Keys a limit by the caller rather than by the connection when we know who they are.
 *
 * An authenticated user behind a shared address should not spend someone else's budget, and an
 * attacker rotating addresses should not get a fresh budget each time. Falls back to the address,
 * normalised so an IPv6 client cannot simply move within its own prefix.
 *
 * @param req - The request.
 * @returns The key to count against.
 */
function key_for(req: Request): string {
  return req.auth?.sub ?? ipKeyGenerator(req.ip ?? 'unknown');
}

/**
 * Answers a rate-limited request with the same problem document shape as every other error.
 *
 * Written as a handler rather than the library's `message` option, because that option sends a
 * bare JSON body with the wrong content type, which would make this the one error response a
 * client has to special-case.
 */
const rate_limited_handler: RequestHandler = (req, res) => {
  const request_id = request_id_of(req);

  const problem: Problem = {
    type: problem_type_for(error_codes.rate_limited),
    title: 'Too many requests',
    status: 429,
    detail: 'Too many requests. Try again shortly.',
    instance: req.originalUrl,
    code: error_codes.rate_limited,
    ...(request_id === undefined ? {} : { request_id }),
  };

  res.status(429).type(problem_content_type).json(problem);
};

/**
 * Loose limit for reads. The blotter polls and refreshes, so this only catches abuse.
 */
export const read_rate_limit: RequestHandler = rate_limit({
  windowMs: 60_000,
  limit: env.READ_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: key_for,
  ...store_for('rl:read:'),
  handler: rate_limited_handler,
});

/** Tighter limit for writes, which touch the database and broadcast to every connected client. */
export const write_rate_limit: RequestHandler = rate_limit({
  windowMs: 60_000,
  limit: env.WRITE_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: key_for,
  ...store_for('rl:write:'),
  handler: rate_limited_handler,
});

/**
 * Strict limit for the credential endpoints.
 *
 * Always keyed by address, because the caller is by definition not authenticated yet. This bounds
 * one client; the per-account lockout in `login_attempts.ts` bounds one account, and an attacker
 * needs to get past both.
 */
export const auth_rate_limit: RequestHandler = rate_limit({
  windowMs: 60_000,
  limit: env.AUTH_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? 'unknown'),
  ...store_for('rl:auth:'),
  handler: rate_limited_handler,
});
