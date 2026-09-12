import rate_limit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { problem_content_type, problem_type_for, type Problem } from '@blotter/shared';
import { error_codes } from '../lib/errors/app_error.js';
import { request_id_of } from '../lib/logging/logger.js';

/**
 * Answers a rate-limited request with the same problem document shape as every other error.
 *
 * Written as a handler rather than the library's `message` option, because that option sends a
 * bare JSON body with the wrong content type, which would make this the one error response a
 * client has to special-case.
 */
const rate_limited_handler: RequestHandler = (req, res) => {
  const problem: Problem = {
    type: problem_type_for(error_codes.rate_limited),
    title: 'Too many requests',
    status: 429,
    detail: 'Too many requests. Try again shortly.',
    instance: req.originalUrl,
    code: error_codes.rate_limited,
    ...(request_id_of(req) === undefined ? {} : { request_id: request_id_of(req) }),
  };

  res.status(429).type(problem_content_type).json(problem);
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
  handler: rate_limited_handler,
});

/** Tighter limit for writes, which touch the database and broadcast to every connected client. */
export const write_rate_limit: RequestHandler = rate_limit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rate_limited_handler,
});
