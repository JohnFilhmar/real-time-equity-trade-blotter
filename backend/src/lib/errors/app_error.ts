import { problem_codes, type ProblemCode } from '@blotter/shared';

/**
 * Machine-readable error codes returned to clients.
 *
 * Re-exported from the shared package rather than declared again here, so the server and any
 * client branch on one list.
 */
export const error_codes = problem_codes;

/** One of the error codes the API can return. */
export type ErrorCode = ProblemCode;

/**
 * An error carrying the HTTP status and machine-readable code the client should see.
 *
 * Anything thrown that is not an `AppError` is treated as unexpected and reported as a generic
 * 500, so an internal message can never reach a client by accident.
 */
export class AppError extends Error {
  /** HTTP status to respond with. */
  readonly status: number;

  /** Stable code clients can branch on, rather than parsing the message. */
  readonly code: ErrorCode;

  /** Optional structured detail, safe to expose. Never contains internal state. */
  readonly details: unknown;

  /**
   * Whole seconds the client should wait before trying again, for a refusal that ends on its own.
   * The error handler sends it as the `Retry-After` header.
   */
  readonly retry_after_seconds: number | undefined;

  /**
   * @param status - HTTP status code.
   * @param code - Stable machine-readable code.
   * @param message - Human-readable message. Safe to show a client.
   * @param details - Optional structured detail, such as field-level validation problems.
   * @param retry_after_seconds - Optional wait before a retry can succeed, in whole seconds.
   */
  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    retry_after_seconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retry_after_seconds = retry_after_seconds;
  }

  /**
   * Builds a 404.
   *
   * @param resource - What was looked for, for example `trade`.
   * @param identifier - The identifier that missed.
   * @returns An `AppError` with status 404.
   */
  static not_found(resource: string, identifier: string): AppError {
    return new AppError(404, error_codes.not_found, `${resource} ${identifier} was not found`);
  }

  /**
   * Builds a 409, used when an amendment loses an optimistic concurrency check.
   *
   * @param message - What conflicted, in terms the client can act on.
   * @returns An `AppError` with status 409.
   */
  static conflict(message: string): AppError {
    return new AppError(409, error_codes.conflict, message);
  }

  /**
   * Builds a 422 for a rule the schema cannot express, such as a configurable limit.
   *
   * @param message - What was rejected, in terms the client can act on.
   * @param details - Optional field-level detail.
   * @returns An `AppError` with status 422.
   */
  static validation_failed(message: string, details?: unknown): AppError {
    return new AppError(422, error_codes.validation_failed, message, details);
  }

  /**
   * Builds a 401.
   *
   * The message is deliberately the same whichever way authentication failed. Distinguishing "no
   * such user" from "wrong password" hands an attacker a way to enumerate accounts.
   *
   * @param message - What the client should be told. Keep it generic.
   * @returns An `AppError` with status 401.
   */
  static unauthenticated(message = 'Authentication is required'): AppError {
    return new AppError(401, error_codes.unauthenticated, message);
  }

  /**
   * Builds a 403, used when a caller is known but not permitted.
   *
   * @param message - What was refused, in terms the client can act on.
   * @returns An `AppError` with status 403.
   */
  static forbidden(message: string): AppError {
    return new AppError(403, error_codes.forbidden, message);
  }

  /**
   * Builds a 429 for an account-level lockout, as distinct from the request rate limiter.
   *
   * The wait goes out twice: in the detail for a person to read, and as `Retry-After` so a client
   * can count down without parsing the sentence.
   *
   * @param seconds - How long until the account unlocks, in whole seconds.
   * @returns An `AppError` with status 429.
   */
  static locked_out(seconds: number): AppError {
    return new AppError(
      429,
      error_codes.rate_limited,
      `Too many failed attempts. Try again in ${seconds.toString()} seconds.`,
      undefined,
      seconds,
    );
  }
}
