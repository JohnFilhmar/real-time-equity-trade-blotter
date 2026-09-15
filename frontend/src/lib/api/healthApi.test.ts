import { describe, expect, it } from 'vitest';
import { probe_ready } from './healthApi';

function answer(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('probe_ready', () => {
  it('reports ready with the round trip when the API says it can serve', async () => {
    const readiness = await probe_ready(answer(200, { status: 'ready', database: 'up' }));
    expect(readiness.state).toBe('ready');
    expect(readiness.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('reports unavailable when the API cannot reach its database', async () => {
    const readiness = await probe_ready(answer(503, { status: 'not_ready', database: 'down' }));
    expect(readiness.state).toBe('unavailable');
  });

  it('reports unavailable when the answer is not the documented shape', async () => {
    const readiness = await probe_ready(answer(200, { ok: true }));
    expect(readiness.state).toBe('unavailable');
  });

  it('reports unavailable when the request never completes', async () => {
    const readiness = await probe_ready(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(readiness.state).toBe('unavailable');
  });
});
