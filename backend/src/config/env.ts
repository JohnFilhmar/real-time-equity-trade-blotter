import { config as load_dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// The repository root .env is the one local configuration file, so it is loaded by path rather
// than from wherever the process happened to start. A variable already in the environment wins.
load_dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), override: false, quiet: true });

/**
 * The shortest signing secret this will accept.
 *
 * A JWT signed with a guessable secret is not signed. Thirty-two bytes is the floor for HS256, and
 * refusing to boot below it is better than a service that starts and is trivially forgeable.
 */
const minimum_secret_length = 32;

const env_schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(minimum_secret_length, `JWT_ACCESS_SECRET must be at least ${minimum_secret_length.toString()} characters`),
  JWT_REFRESH_SECRET: z
    .string()
    .min(minimum_secret_length, `JWT_REFRESH_SECRET must be at least ${minimum_secret_length.toString()} characters`),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
  /** Cost factor for bcrypt. Raise it, never lower it. */
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  /** Whether the refresh cookie carries the Secure attribute. Off only for plain-HTTP local runs. */
  COOKIE_SECURE: z.stringbool().default(false),
  /** Requests a minute allowed on the credential endpoints, per address. */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  /** Requests a minute allowed on reads, per user. */
  READ_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  /** Requests a minute allowed on writes, per user. */
  WRITE_RATE_LIMIT: z.coerce.number().int().positive().default(60),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().max(100).default(5),
  LOGIN_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),

  SEED_ON_STARTUP: z.stringbool().default(true),
  /**
   * Password given to the demo accounts seeded into an empty database.
   *
   * A known credential is only acceptable because these accounts exist so a reviewer can sign in
   * to a throwaway local stack. It lives here rather than in the source so it can be changed
   * without a rebuild, and the startup log says plainly that demo accounts were created.
   */
  SEED_USER_PASSWORD: z.string().min(8).default('blotter-demo-2026'),
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
 * once, and never echoes a value, so a bad `DATABASE_URL` or a weak signing secret cannot leak
 * into logs by way of the error that rejected it.
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
