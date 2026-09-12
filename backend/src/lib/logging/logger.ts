import { randomUUID } from 'node:crypto';
import { pino, type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { RequestHandler } from 'express';
import { env, is_production } from '../../config/env.js';

/** Header a caller can use to supply its own correlation id, and the one the response echoes. */
export const request_id_header = 'x-request-id';

/**
 * The process logger.
 *
 * JSON in production because that is what a log pipeline parses, and pretty-printed nowhere:
 * pino-pretty is a dependency that earns its place in a real deployment and not in this exercise,
 * so a developer reading raw JSON is the deliberate trade.
 */
export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'blotter-api' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
});

/**
 * One structured line per request, carrying a correlation id.
 *
 * The id is taken from the caller's `x-request-id` when it sends one, so a trace that started
 * upstream stays one trace, and generated otherwise. It goes back on the response header and into
 * every error body, which is what turns "an error happened" into a string the user can quote and
 * an operator can grep.
 */
export const request_logger: RequestHandler = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const supplied = req.headers[request_id_header];
    const id = typeof supplied === 'string' && supplied.length > 0 ? supplied : randomUUID();
    res.setHeader(request_id_header, id);
    return id;
  },
  customLogLevel: (_req, res, error) => {
    if (error !== undefined || res.statusCode >= 500) {
      return 'error';
    }
    return res.statusCode >= 400 ? 'warn' : 'info';
  },
  // The default serialisers log every header on every request. In production that is noise around
  // the four fields anyone actually greps for.
  serializers: is_production
    ? {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      }
    : {},
});

/**
 * Reads the correlation id off a request without assuming the shape pino-http added.
 *
 * @param req - The request, which pino-http has decorated with `id`.
 * @returns The id, or `undefined` when the logger did not run, which happens in unit tests that
 * build a router directly.
 */
export function request_id_of(req: unknown): string | undefined {
  if (typeof req !== 'object' || req === null || !('id' in req)) {
    return undefined;
  }

  const id: unknown = req.id;
  return typeof id === 'string' ? id : undefined;
}
