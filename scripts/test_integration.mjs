// Runs the backend's database-backed tier against the compose Postgres and Redis.
//
// The tier skips itself when TEST_DATABASE_URL is unset, so a developer with no database still
// gets a green `npm test`. This wrapper exists so `npm run test:integration` points at the compose
// services by default on every operating system, since `VAR=value command` is not portable to
// Windows shells. Any variable already set in the environment wins.

import { spawnSync } from 'node:child_process';

const defaults = {
  TEST_DATABASE_URL: 'postgresql://blotter:blotter@localhost:5432/blotter?schema=public',
  DATABASE_URL: 'postgresql://blotter:blotter@localhost:5432/blotter?schema=public',
  TEST_REDIS_URL: 'redis://localhost:6379',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'integration-only-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'integration-only-refresh-secret-0123456789abcdef',
};

const env = { ...defaults, ...process.env };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const result = spawnSync(npm, ['run', 'test:integration', '--workspace', 'backend'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
