import { z } from 'zod';

/** Machine-readable error codes the API returns, carried as a problem extension member. */
export const problem_codes = {
  validation_failed: 'validation_failed',
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
  rate_limited: 'rate_limited',
  locked_out: 'locked_out',
  internal: 'internal',
} as const;

/** One of the error codes the API can return. */
export type ProblemCode = (typeof problem_codes)[keyof typeof problem_codes];

/** The media type every error response carries, per RFC 9457. */
export const problem_content_type = 'application/problem+json';

/**
 * Builds the `type` URI for a code.
 *
 * RFC 9457 permits a relative reference, and a relative one is the honest choice here: there is no
 * published documentation site to point at, and inventing an absolute URL that resolves to nothing
 * is worse than a path a reader can see is local to this API.
 *
 * @param code - The machine-readable code.
 * @returns The problem type reference.
 */
export function problem_type_for(code: ProblemCode): string {
  return `/problems/${code.replaceAll('_', '-')}`;
}

/** One field-level validation failure, carried on a validation problem. */
export const problem_field_error_schema = z.object({
  field: z.string(),
  message: z.string(),
});

/**
 * An error response, shaped as an RFC 9457 problem document.
 *
 * `type`, `title`, `status`, `detail` and `instance` are the standard members. `code`, `errors`
 * and `request_id` are extension members, which the RFC allows at the top level: `code` keeps the
 * stable value clients branch on without parsing a URI, `errors` carries field-level detail for a
 * validation failure, and `request_id` is the correlation id from the request log, so a user can
 * quote one string back and have it found.
 */
export const problem_schema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int().min(100).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.enum([
    problem_codes.validation_failed,
    problem_codes.unauthenticated,
    problem_codes.forbidden,
    problem_codes.not_found,
    problem_codes.conflict,
    problem_codes.rate_limited,
    problem_codes.locked_out,
    problem_codes.internal,
  ]),
  errors: z.array(problem_field_error_schema).optional(),
  request_id: z.string().optional(),
});

/** One field-level validation failure. */
export type ProblemFieldError = z.infer<typeof problem_field_error_schema>;

/** An error response. */
export type Problem = z.infer<typeof problem_schema>;
