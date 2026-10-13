import { accounts, demo_password, ensure_auth_budget, expect, test } from './test-utils';

// Only the web origin faces the network. The API and the live link's hub answer through it, the
// services' own ports are closed, and the metrics endpoint is not forwarded at all. The hub check
// signs in and negotiates a connection with the access token, which proves the edge sends /hubs to
// the realtime service and that the realtime service accepts the gateway's tokens. Runs against
// the compose stack as shipped, where every service listens on 8080 inside the network only and
// the trades service's gRPC listener on 8081.
test.describe('what the stack exposes @critical', () => {
  test('the API and the hub answer through the web origin, their ports are closed, and metrics stay inside', async ({ request, baseURL }) => {
    test.slow();

    const ready = await request.get('/ready');
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', database: 'up' });

    const metrics = await request.get('/metrics');
    expect(metrics.status()).toBe(404);

    await ensure_auth_budget(request, 1);
    const login = await request.post('/api/v1/auth/login', { data: { username: accounts.viewer, password: demo_password } });
    expect(login.status()).toBe(200);
    const session: unknown = await login.json();
    const token =
      typeof session === 'object' && session !== null && 'accessToken' in session && typeof session.accessToken === 'string'
        ? session.accessToken
        : '';
    expect(token).not.toBe('');

    const negotiate = await request.post('/hubs/blotter/negotiate?negotiateVersion=1', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(negotiate.status()).toBe(200);
    expect(await negotiate.json()).toMatchObject({
      availableTransports: expect.arrayContaining([expect.objectContaining({ transport: 'WebSockets' })]),
    });

    const refused = await request.post('/hubs/blotter/negotiate?negotiateVersion=1');
    expect(refused.status()).toBe(401);

    const host = new URL(baseURL ?? 'http://localhost').hostname;
    for (const port of [5000, 8080, 8081]) {
      await expect(request.get(`http://${host}:${port.toString()}/health`, { timeout: 5_000 })).rejects.toThrow();
    }
  });
});
