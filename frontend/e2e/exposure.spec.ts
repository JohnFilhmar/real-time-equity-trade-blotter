import { expect, test } from './test-utils';

// Only the web origin faces the network. The API answers through the web server's forwarding, its
// own port is closed, and the metrics endpoint is not forwarded at all. Runs against the compose
// stack as shipped, where the API listens on 5000 inside the network only.
test.describe('what the stack exposes @critical', () => {
  test('the API answers through the web origin, its port is closed, and metrics stay inside', async ({ request, baseURL }) => {
    const ready = await request.get('/ready');
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', database: 'up' });

    const metrics = await request.get('/metrics');
    expect(metrics.status()).toBe(404);

    const host = new URL(baseURL ?? 'http://localhost:3000').hostname;
    await expect(request.get(`http://${host}:5000/health`, { timeout: 5_000 })).rejects.toThrow();
  });
});
