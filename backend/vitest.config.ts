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
      CORS_ORIGINS: 'http://localhost:3000',
      SEED_ON_STARTUP: 'false',
    },
  },
});
