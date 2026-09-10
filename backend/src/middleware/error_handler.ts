import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, error_codes } from '../lib/errors/app_error.js';
import { is_production } from '../config/env.js';

/** Shape every error response takes, so clients parse one thing. */
interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Terminal 404 handler. Mounted after every route so an unmatched path is an error like any
 * other rather than a bare response written from inside the router.
 */
export const not_found_handler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, error_codes.not_found, `No route matches ${req.method} ${req.path}`));
};

/**
 * Converts anything thrown in a handler into the single error response shape.
 *
 * Express 5 forwards rejected promises here on its own, so route handlers need no try/catch. Zod
 * failures become 422 with field-level detail; `AppError` carries its own status; everything else
 * is an unexpected 500 whose message is never echoed to the client.
 */
export const error_handler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    const body: ErrorResponseBody = {
      error: {
        code: error_codes.validation_failed,
        message: 'Request validation failed',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
    res.status(422).json(body);
    return;
  }

  if (error instanceof AppError) {
    const body: ErrorResponseBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
    res.status(error.status).json(body);
    return;
  }

  // Unexpected: log the real thing server-side, tell the client nothing about it.
  console.error('unhandled_error', error);

  const body: ErrorResponseBody = {
    error: {
      code: error_codes.internal,
      message: is_production
        ? 'An unexpected error occurred'
        : `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`,
    },
  };
  res.status(500).json(body);
};
