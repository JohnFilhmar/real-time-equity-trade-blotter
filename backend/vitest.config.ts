import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The env module validates at import time and fails the boot on a missing variable, which is
    // the behaviour we want in production. Tests therefore declare their own environment rather
    // than the schema being weakened to tolerate an absent one.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://blotter:blotter@localhost:5432/blotter_test?schema=public',
      CORS_ORIGINS: 'http://localhost:3000',
      SEED_ON_STARTUP: 'false',
    },
  },
});
