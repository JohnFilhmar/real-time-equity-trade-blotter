import 'dotenv/config';
import { z } from 'zod';

const env_schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_ON_STARTUP: z.stringbool().default(true),
  SEED_TRADE_COUNT: z.coerce.number().int().min(0).max(5000).default(500),
  LIVE_FEED_ENABLED: z.stringbool().default(true),
  LIVE_FEED_MIN_INTERVAL_MS: z.coerce.number().int().min(250).max(600_000).default(3_000),
  LIVE_FEED_MAX_INTERVAL_MS: z.coerce.number().int().min(250).max(600_000).default(8_000),
  /**
   * Per-currency notional ceilings, the fat-finger control.
   *
   * One limit per currency rather than one global figure, because the blotter quotes in USD and in
   * GBX and comparing 78 pence against a dollar ceiling would reject or admit the wrong trades.
   * Normalising through an FX rate is the real answer and is out of scope: inventing a rate would
   * be inventing a financial convention, which is the thing this exercise should not do.
   */
  MAX_NOTIONAL_USD: z.coerce.number().positive().default(50_000_000),
  MAX_NOTIONAL_GBX: z.coerce.number().positive().default(4_000_000_000),
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

/**
 * Pacing for the simulated desk activity.
 *
 * The two bounds are sorted rather than rejected when they arrive the wrong way round, because an
 * inverted window is an obvious typo in a compose file and refusing to boot over it would be a
 * worse outcome than quietly running the feed between the same two numbers.
 */
export const live_feed_options = {
  min_interval_ms: Math.min(env.LIVE_FEED_MIN_INTERVAL_MS, env.LIVE_FEED_MAX_INTERVAL_MS),
  max_interval_ms: Math.max(env.LIVE_FEED_MIN_INTERVAL_MS, env.LIVE_FEED_MAX_INTERVAL_MS),
} as const;

/** The notional ceiling for each currency the blotter quotes in. */
export const notional_limits: Readonly<Record<'USD' | 'GBX', number>> = {
  USD: env.MAX_NOTIONAL_USD,
  GBX: env.MAX_NOTIONAL_GBX,
};
