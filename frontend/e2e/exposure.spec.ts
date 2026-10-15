import { expect, test } from './test-utils';

// Only the web origin faces the network. The API and the live link's hub answer through it, the
// services' own ports are closed, and the metrics endpoint is not forwarded at all. The hub check
// negotiates without a token: only the realtime service answers that with a bearer challenge (the
// gateway would send a problem document and the web app a 404), which proves the edge routes /hubs
// there without spending the credential budget every other test shares. Signed-in browsers going
// live in the other specs cover the authenticated path. Runs against the compose stack as shipped,
// where every service listens on 8080 inside the network only and the trades service's gRPC
// listener on 8081.
test.describe('what the stack exposes @critical', () => {
  test('the API and the hub answer through the web origin, their ports are closed, and metrics stay inside', async ({ request, baseURL }) => {
    const ready = await request.get('/ready');
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', database: 'up' });

    const metrics = await request.get('/metrics');
    expect(metrics.status()).toBe(404);

    const negotiate = await request.post('/hubs/blotter/negotiate?negotiateVersion=1');
    expect(negotiate.status()).toBe(401);
    expect(negotiate.headers()['www-authenticate']).toContain('Bearer');

    const host = new URL(baseURL ?? 'http://localhost').hostname;
    for (const port of [5000, 8080, 8081]) {
      await expect(request.get(`http://${host}:${port.toString()}/health`, { timeout: 5_000 })).rejects.toThrow();
    }
  });
});
