import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The database-backed tier is deliberately not part of the default run. It needs a live
    // Postgres, so leaving it in meant `npm test` quietly changed shape depending on whether
    // TEST_DATABASE_URL happened to be set, and in CI it executed before the migrations had been
    // applied. It has its own config, and `npm run test:integration` is the only way to reach it.
    exclude: ['**/node_modules/**', 'dist/**', 'src/**/*.integration.test.ts'],
    // The env module validates at import time and fails the boot on a missing variable, which is
    // the behaviour we want in production. Tests therefore declare their own environment rather
    // than the schema being weakened to tolerate an absent one.
    env: {
      NODE_ENV: 'test',
      // Request logging is the feature, not the test output. Silenced here so a failing assertion
      // is visible rather than buried under one JSON line per request.
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://blotter:blotter@localhost:5432/blotter_test?schema=public',
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
