// Runs an npm command with a placeholder DATABASE_URL when none is set.
//
// prisma.config.ts resolves DATABASE_URL eagerly, and `prisma generate` reads the config even
// though it never connects, so a fresh clone with no env file cannot build the API or generate the
// client. The Dockerfile sets the same placeholder for the same reason. A real value already in the
// environment always wins, and the placeholder is never used at runtime.
//
// Usage: node scripts/with_build_env.mjs run build --workspace backend

import { spawnSync } from 'node:child_process';

const env = {
  DATABASE_URL: 'postgresql://build:build@127.0.0.1:5432/build',
  ...process.env,
};

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, process.argv.slice(2), {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
