import { config as load_dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

// The repository root .env is the one local configuration file, so it is loaded by path rather
// than from wherever prisma was invoked. A variable already in the environment wins.
load_dotenv({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: false });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
