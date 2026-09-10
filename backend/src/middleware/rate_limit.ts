import rate_limit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { error_codes } from '../lib/errors/app_error.js';

const rate_limited_body = {
  error: {
    code: error_codes.rate_limited,
    message: 'Too many requests. Try again shortly.',
  },
};

/**
 * Loose limit for reads. The blotter polls and refreshes, so this only catches abuse.
 *
 * Limits are in-process. Across replicas they would need a shared Redis store, which is noted as
 * a trade-off in the README rather than built for a single-container exercise.
 */
export const read_rate_limit: RequestHandler = rate_limit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rate_limited_body,
});

/** Tighter limit for writes, which touch the database and broadcast to every connected client. */
export const write_rate_limit: RequestHandler = rate_limit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rate_limited_body,
});
