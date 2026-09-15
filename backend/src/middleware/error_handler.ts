import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import {
  problem_content_type,
  problem_type_for,
  validation_failed_detail,
  type Problem,
  type ProblemCode,
  type ProblemFieldError,
} from '@blotter/shared';
import { AppError, error_codes } from '../lib/errors/app_error.js';
import { is_production } from '../config/env.js';
import { logger, request_id_of } from '../lib/logging/logger.js';

/** Human-readable titles, one per code, so a problem document never invents its own wording. */
const titles: Readonly<Record<ProblemCode, string>> = {
  validation_failed: 'Request validation failed',
  unauthenticated: 'Authentication required',
  forbidden: 'Not permitted',
  not_found: 'Resource not found',
  conflict: 'Conflict',
  rate_limited: 'Too many requests',
  locked_out: 'Too many requests',
  internal: 'Internal server error',
};

/**
 * Assembles an RFC 9457 problem document.
 *
 * @param code - The machine-readable code.
 * @param status - HTTP status.
 * @param detail - What went wrong, in terms the client can act on.
 * @param instance - The path that produced it.
 * @param request_id - Correlation id, when the request logger supplied one.
 * @param errors - Field-level detail, for a validation failure.
 * @returns The problem document to serialise.
 */
function build_problem(
  code: ProblemCode,
  status: number,
  detail: string,
  instance: string,
  request_id?: string,
  errors?: ProblemFieldError[],
): Problem {
  return {
    type: problem_type_for(code),
    title: titles[code],
    status,
    detail,
    instance,
    code,
    ...(errors === undefined ? {} : { errors }),
    ...(request_id === undefined ? {} : { request_id }),
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
 * Converts anything thrown in a handler into one problem document.
 *
 * Responses use `application/problem+json` as RFC 9457 specifies. `code`, `errors` and
 * `request_id` ride along as extension members, which the RFC permits, so a client still branches
 * on a stable string instead of parsing a URI and a user can quote one id back.
 *
 * Express 5 forwards rejected promises here on its own, so route handlers need no try/catch. Zod
 * failures become 422 with field-level detail; `AppError` carries its own status, and a
 * `Retry-After` header when it knows how long the client should wait; everything else is an
 * unexpected 500 whose message is never echoed to the client in production.
 */
export const error_handler: ErrorRequestHandler = (error, req, res, _next) => {
  const request_id = request_id_of(req);
  const instance = req.originalUrl;

  if (error instanceof ZodError) {
    const errors: ProblemFieldError[] = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    res
      .status(422)
      .type(problem_content_type)
      .json(
        build_problem(
          error_codes.validation_failed,
          422,
          validation_failed_detail,
          instance,
          request_id,
          errors,
        ),
      );
    return;
  }

  if (error instanceof AppError) {
    const errors = Array.isArray(error.details)
      ? error.details.filter(
          (detail): detail is ProblemFieldError =>
            typeof detail === 'object' &&
            detail !== null &&
            'field' in detail &&
            'message' in detail,
        )
      : undefined;

    if (error.retry_after_seconds !== undefined) {
      res.set('Retry-After', Math.ceil(error.retry_after_seconds).toString());
    }

    res
      .status(error.status)
      .type(problem_content_type)
      .json(
        build_problem(
          error.code,
          error.status,
          error.message,
          instance,
          request_id,
          errors === undefined || errors.length === 0 ? undefined : errors,
        ),
      );
    return;
  }

  // Unexpected: log the real thing server-side, tell the client nothing about it.
  logger.error({ err: error, request_id }, 'unhandled_error');

  res
    .status(500)
    .type(problem_content_type)
    .json(
      build_problem(
        error_codes.internal,
        500,
        is_production
          ? 'An unexpected error occurred.'
          : `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`,
        instance,
        request_id,
      ),
    );
};
