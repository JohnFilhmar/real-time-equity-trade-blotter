import 'dotenv/config';
import { z } from 'zod';

const env_schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SEED_ON_STARTUP: z.stringbool().default(true),
  SEED_TRADE_COUNT: z.coerce.number().int().min(0).max(5000).default(500),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

/**
 * Parses the process environment once, at import time, and fails the boot rather than letting a
 * missing variable surface as an undefined deep inside a request.
 *
 * @throws {Error} When any variable is missing or malformed. The message lists every problem at
 * once, and never echoes a value, so a bad `DATABASE_URL` cannot leak credentials into logs.
 */
function load_env(): z.infer<typeof env_schema> {
  const parsed = env_schema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return parsed.data;
}

/** The validated, typed environment. Read this instead of `process.env`. */
export const env = load_env();

/** CORS origin allowlist, parsed from the comma-separated `CORS_ORIGINS` variable. */
export const cors_origins: readonly string[] = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

/** True when running under `NODE_ENV=production`. */
export const is_production = env.NODE_ENV === 'production';
