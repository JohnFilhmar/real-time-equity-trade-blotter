/** Machine-readable error codes returned to clients. */
export const error_codes = {
  validation_failed: 'validation_failed',
  not_found: 'not_found',
  conflict: 'conflict',
  rate_limited: 'rate_limited',
  internal: 'internal',
} as const;

/** One of the error codes the API can return. */
export type ErrorCode = (typeof error_codes)[keyof typeof error_codes];

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
   * @param status - HTTP status code.
   * @param code - Stable machine-readable code.
   * @param message - Human-readable message. Safe to show a client.
   * @param details - Optional structured detail, such as field-level validation problems.
   */
  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
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
}
