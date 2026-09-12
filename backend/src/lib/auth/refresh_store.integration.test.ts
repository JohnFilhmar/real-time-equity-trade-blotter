import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { create_login_attempts } from './login_attempts.js';
import { create_refresh_store } from './refresh_store.js';

/**
 * The Redis this tier runs against.
 *
 * Separate from `REDIS_URL` for the same reason the database tier has its own variable: running
 * the unit tests must never point a suite that writes keys at whatever server happens to be
 * configured. Without it the tier skips rather than failing a developer with no Redis running.
 */
const test_redis_url = process.env.TEST_REDIS_URL;

describe.skipIf(test_redis_url === undefined)('refresh store, against real Redis', () => {
  const redis = new Redis(test_redis_url ?? '', { maxRetriesPerRequest: null, lazyConnect: true });
  const store = create_refresh_store(redis);

  afterAll(async () => {
    await redis.quit();
  });

  it('rotates a family to its next token', async () => {
    const family = randomUUID();
    const first = randomUUID();
    const second = randomUUID();

    await store.start(family, first);

    await expect(store.rotate(family, first, second)).resolves.toBe('rotated');
  });

  it('accepts the new token after a rotation, and not the old one', async () => {
    const family = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    const third = randomUUID();

    await store.start(family, first);
    await store.rotate(family, first, second);

    await expect(store.rotate(family, second, third)).resolves.toBe('rotated');
  });

  it('detects a replayed token and destroys the family', async () => {
    const family = randomUUID();
    const first = randomUUID();
    const second = randomUUID();

    await store.start(family, first);
    await store.rotate(family, first, second);

    // The stolen copy comes back.
    await expect(store.rotate(family, first, randomUUID())).resolves.toBe('reused');

    // And the legitimate holder is signed out too, which is the point.
    await expect(store.rotate(family, second, randomUUID())).resolves.toBe('unknown');
  });

  it('reports an unknown family rather than inventing one', async () => {
    await expect(store.rotate(randomUUID(), randomUUID(), randomUUID())).resolves.toBe('unknown');
  });

  it('ends a family on revoke', async () => {
    const family = randomUUID();
    const jti = randomUUID();

    await store.start(family, jti);
    await store.revoke(family);

    await expect(store.rotate(family, jti, randomUUID())).resolves.toBe('unknown');
  });

  it('rotates atomically, so two requests with the same token cannot both succeed', async () => {
    const family = randomUUID();
    const first = randomUUID();

    await store.start(family, first);

    // The race the Lua script exists to settle. Exactly one of these may rotate; the other has to
    // see that the token has already been spent.
    const [left, right] = await Promise.all([
      store.rotate(family, first, randomUUID()),
      store.rotate(family, first, randomUUID()),
    ]);

    expect([left, right].filter((outcome) => outcome === 'rotated')).toHaveLength(1);
    expect([left, right].filter((outcome) => outcome === 'reused')).toHaveLength(1);
  });
});

describe.skipIf(test_redis_url === undefined)('login attempts, against real Redis', () => {
  const redis = new Redis(test_redis_url ?? '', { maxRetriesPerRequest: null, lazyConnect: true });
  const attempts = create_login_attempts(redis);

  afterAll(async () => {
    await redis.quit();
  });

  it('does not lock an account that has not failed', async () => {
    await expect(attempts.seconds_locked(`user_${randomUUID()}`)).resolves.toBe(0);
  });

  it('locks an account once the failures reach the limit', async () => {
    const username = `user_${randomUUID()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await attempts.record_failure(username);
    }

    await expect(attempts.seconds_locked(username)).resolves.toBeGreaterThan(0);
  });

  it('counts the same account whatever case it is typed in', async () => {
    const username = `User_${randomUUID()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await attempts.record_failure(username.toLowerCase());
    }

    await expect(attempts.seconds_locked(username.toUpperCase())).resolves.toBeGreaterThan(0);
  });

  it('clears the count on a successful login', async () => {
    const username = `user_${randomUUID()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await attempts.record_failure(username);
    }
    await attempts.clear(username);

    await expect(attempts.seconds_locked(username)).resolves.toBe(0);
  });
});
