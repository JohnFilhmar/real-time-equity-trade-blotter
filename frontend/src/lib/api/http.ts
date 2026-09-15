import type { z } from 'zod';
import { problem_schema, type ProblemCode, type ProblemFieldError } from '@blotter/shared';
import { api_url } from '@/config/env';

/** Codes the client adds to the server's list: the request never arrived, or the answer was off-contract. */
export type ClientErrorCode = ProblemCode | 'network' | 'contract';

/**
 * A failed API call, carrying what the server said in the shape the interface branches on.
 *
 * `code` is the stable value to switch on; `detail` is the sentence to show; `errors` holds
 * field-level validation messages for a form to place beside its inputs; `retry_after_seconds` is
 * the wait the server asked for, such as what is left of an account lockout.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly detail: string;
  readonly errors: readonly ProblemFieldError[];
  readonly request_id: string | undefined;
  readonly retry_after_seconds: number | null;

  /**
   * @param status - HTTP status, or 0 when the request never completed.
   * @param code - The machine-readable code.
   * @param detail - What went wrong, in words a user can act on.
   * @param errors - Field-level detail, when the server supplied any.
   * @param request_id - The server's correlation id, when supplied.
   * @param retry_after_seconds - Whole seconds from a `Retry-After` header, or `null` without one.
   */
  constructor(
    status: number,
    code: ClientErrorCode,
    detail: string,
    errors: readonly ProblemFieldError[] = [],
    request_id?: string,
    retry_after_seconds: number | null = null,
  ) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.errors = errors;
    this.request_id = request_id;
    this.retry_after_seconds = retry_after_seconds;
  }
}

/** How one request is made. */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bearer token for the Authorization header. Omit for the public auth routes. */
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * Reads a `Retry-After` header given as whole seconds.
 *
 * The header may carry an HTTP date instead. This API only sends seconds, so a date counts as no
 * wait rather than being converted against a client clock that may disagree with the server's.
 *
 * @param response - The failed response.
 * @returns Whole seconds, or `null` when the header is absent or is not a plain count.
 */
function retry_after_seconds_of(response: Response): number | null {
  const value = response.headers.get('retry-after')?.trim();
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

/**
 * Turns a non-2xx response into an {@link ApiError}, reading the problem document when there is one.
 *
 * @param response - The failed response.
 * @returns The error to throw.
 */
async function error_from(response: Response): Promise<ApiError> {
  const text = await response.text();
  const retry_after_seconds = retry_after_seconds_of(response);

  try {
    const problem = problem_schema.parse(JSON.parse(text));
    return new ApiError(
      problem.status,
      problem.code,
      problem.detail ?? problem.title,
      problem.errors ?? [],
      problem.request_id,
      retry_after_seconds,
    );
  } catch {
    return new ApiError(
      response.status,
      'internal',
      `The API answered ${response.status.toString()}`,
      [],
      undefined,
      retry_after_seconds,
    );
  }
}

/**
 * Performs one request against the API and returns the raw response.
 *
 * @param path - Path under the API base, for example `/api/v1/trades`.
 * @param options - Method, body, credentials.
 * @returns The response, already checked to be 2xx.
 * @throws {ApiError} With the server's problem document on a non-2xx answer, or code `network` when
 * the request never completed.
 */
async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (options.token !== undefined && options.token !== null) {
    headers.authorization = `Bearer ${options.token}`;
  }

  let response: Response;

  try {
    response = await fetch(`${api_url}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      // Same origin since the web server forwards the API. Cookies authenticate nothing here (the
      // guard reads only the bearer header); the refresh cookie is scoped to the auth routes, and
      // whatever an edge in front of the site set, such as a tunnel's warning pass, rides along.
      credentials: 'same-origin',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'network', 'The API could not be reached');
  }

  if (!response.ok) {
    throw await error_from(response);
  }

  return response;
}

/**
 * Calls the API and parses the JSON answer with a schema from the shared contract.
 *
 * Parsing rather than casting is what makes the client honest: an answer that drifts from the
 * contract fails here with a clear code instead of surfacing as `undefined` in a cell.
 *
 * @param path - Path under the API base.
 * @param schema - The shared schema the answer must satisfy.
 * @param options - Method, body, credentials.
 * @returns The parsed answer.
 * @throws {ApiError} On a non-2xx answer, a network failure, or an off-contract body.
 */
export async function api_json<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);
  const parsed = schema.safeParse(await response.json());

  if (!parsed.success) {
    throw new ApiError(response.status, 'contract', 'The API answered in an unexpected shape');
  }

  return parsed.data;
}

/**
 * Calls the API for an answer with no body, such as a 204.
 *
 * @param path - Path under the API base.
 * @param options - Method, body, credentials.
 * @throws {ApiError} On a non-2xx answer or a network failure.
 */
export async function api_void(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}

/**
 * Narrows an unknown thrown value to an {@link ApiError}.
 *
 * @param error - Whatever was caught.
 * @returns The error when it is one of ours, otherwise `null`.
 */
export function as_api_error(error: unknown): ApiError | null {
  return error instanceof ApiError ? error : null;
}
