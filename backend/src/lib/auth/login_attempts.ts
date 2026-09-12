import type { Redis } from 'ioredis';
import { env } from '../../config/env.js';

/**
 * Counts failed logins per account and locks it out after too many.
 *
 * This sits alongside the rate limiter rather than replacing it. The rate limiter bounds one
 * client; this bounds one account, so an attacker spreading attempts across many addresses still
 * runs into a wall on the account they are actually attacking.
 */
export interface LoginAttempts {
  /**
   * Checks whether an account is currently locked.
   *
   * @param username - The account being attempted.
   * @returns Seconds remaining on the lock, or 0 when it is not locked.
   */
  seconds_locked(username: string): Promise<number>;

  /**
   * Records a failure, locking the account once the limit is reached.
   *
   * @param username - The account that failed.
   */
  record_failure(username: string): Promise<void>;

  /**
   * Clears the counter after a successful login.
   *
   * @param username - The account that succeeded.
   */
  clear(username: string): Promise<void>;
}

/**
 * Where an account's failure count lives.
 *
 * Lower-cased so `JSMITH` and `jsmith` cannot be attacked as two separate budgets.
 *
 * @param username - The account.
 * @returns The Redis key.
 */
function attempts_key(username: string): string {
  return `login:attempts:${username.toLowerCase()}`;
}

/**
 * Builds the Redis-backed attempt counter.
 *
 * The window is a sliding lockout rather than a fixed one: every failure re-arms the expiry, so a
 * steady trickle of guesses keeps the account locked instead of resetting the budget each window.
 *
 * @param redis - A connected client.
 * @returns The counter.
 */
export function create_login_attempts(redis: Redis): LoginAttempts {
  return {
    async seconds_locked(username: string): Promise<number> {
      const key = attempts_key(username);
      const count = await redis.get(key);

      if (count === null || Number(count) < env.LOGIN_MAX_ATTEMPTS) {
        return 0;
      }

      const ttl = await redis.ttl(key);
      return ttl > 0 ? ttl : 0;
    },

    async record_failure(username: string): Promise<void> {
      const key = attempts_key(username);
      await redis.incr(key);
      await redis.expire(key, env.LOGIN_LOCKOUT_SECONDS);
    },

    async clear(username: string): Promise<void> {
      await redis.del(attempts_key(username));
    },
  };
}
