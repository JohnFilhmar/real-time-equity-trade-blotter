import { z } from 'zod';
import { api_url } from '@/config/env';
import type { Readiness } from '@/types/readiness';

/** What `GET /ready` answers: 200 with `ready` and the database up, or 503 with `not_ready`. */
export const ready_schema = z.object({
  status: z.enum(['ready', 'not_ready']),
  database: z.enum(['up', 'down']),
});

/**
 * Asks the API whether it can serve, once, and times the round trip.
 *
 * The route is public and sits outside the versioned prefix, so it needs no token and no rate
 * limit budget. Every failure, a 503, a network error or an answer in an unexpected shape, is
 * reported as unavailable rather than thrown: the door shows a state, it does not break.
 *
 * @param fetch_impl - The fetch to use; tests inject one.
 * @returns The state and the round trip in whole milliseconds.
 */
export async function probe_ready(fetch_impl: typeof fetch = fetch): Promise<Readiness> {
  const started = performance.now();
  try {
    const response = await fetch_impl(`${api_url}/ready`, { cache: 'no-store' });
    const latency_ms = Math.round(performance.now() - started);
    if (!response.ok) {
      return { state: 'unavailable', latency_ms };
    }
    const parsed = ready_schema.safeParse(await response.json());
    return { state: parsed.success && parsed.data.status === 'ready' ? 'ready' : 'unavailable', latency_ms };
  } catch {
    return { state: 'unavailable', latency_ms: Math.round(performance.now() - started) };
  }
}
