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
      CORS_ORIGINS: 'http://localhost:3000',
      SEED_ON_STARTUP: 'false',
    },
  },
});
