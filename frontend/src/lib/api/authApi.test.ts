import { afterEach, describe, expect, it, vi } from 'vitest';
import { login } from './authApi';
import { ApiError } from './http';

/**
 * Makes every request answer with one problem document, the way the API reports a refusal.
 *
 * @param status - The HTTP status.
 * @param detail - The problem detail.
 * @param headers - Extra response headers, such as `retry-after`.
 */
function answer_with_problem(status: number, detail: string, headers: Record<string, string> = {}): void {
  const body = JSON.stringify({ type: '/problems/rate-limited', title: 'Too many requests', status, detail, code: 'rate_limited' });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status, headers: { 'content-type': 'application/problem+json', ...headers } }))),
  );
}

/**
 * Attempts a sign-in the stubbed API refuses.
 *
 * @returns Whatever the attempt threw, or `null` if it somehow succeeded.
 */
function refused_login(): Promise<unknown> {
  return login({ username: 'jsmith', password: 'wrong' }).then(
    () => null,
    (error: unknown) => error,
  );
}

describe('login', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads how long a lockout lasts from the Retry-After header', async () => {
    answer_with_problem(429, 'Too many failed attempts. Try again in 900 seconds.', { 'retry-after': '900' });

    const error = await refused_login();

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retry_after_seconds: 900 });
  });

  it('reports no wait when the refusal carries no Retry-After header', async () => {
    answer_with_problem(429, 'Too many requests. Try again shortly.');

    expect(await refused_login()).toMatchObject({ status: 429, retry_after_seconds: null });
  });

  it('reports no wait when Retry-After is a date or not a whole number of seconds', async () => {
    answer_with_problem(429, 'Too many requests.', { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' });
    expect(await refused_login()).toMatchObject({ retry_after_seconds: null });

    answer_with_problem(429, 'Too many requests.', { 'retry-after': '1.5' });
    expect(await refused_login()).toMatchObject({ retry_after_seconds: null });
  });
});
