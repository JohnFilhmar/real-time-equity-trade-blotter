import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The expensive tier, and only it. Kept behind its own config so the cheap tier can run on
    // every push while this one runs where a real Postgres exists, which is the whole reason the
    // `.integration.test.ts` suffix is in the filename.
    include: ['src/**/*.integration.test.ts'],
    // These tests write to a real database, so they must not share a worker with anything else and
    // must not run concurrently with each other against the same rows.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      // Request logging is the feature, not the test output. Silenced here so a failing assertion
      // is visible rather than buried under one JSON line per request.
      LOG_LEVEL: 'silent',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdefghijkl',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdefghijkl',
      REDIS_URL: 'redis://localhost:6379',
      // The lowest cost bcrypt accepts. Real strength is a production concern; here it is the
      // difference between a suite that runs in a second and one that runs in a minute.
      BCRYPT_ROUNDS: '10',
      // High enough that a module-level limiter is never the thing a test trips over. The
      // per-account lockout, which is the security-relevant control, is tested directly.
      AUTH_RATE_LIMIT: '100000',
      READ_RATE_LIMIT: '100000',
      WRITE_RATE_LIMIT: '100000',
      CORS_ORIGINS: 'http://localhost:3000',
      SEED_ON_STARTUP: 'false',
    },
  },
});
