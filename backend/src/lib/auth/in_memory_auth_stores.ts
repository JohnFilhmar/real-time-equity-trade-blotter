import { env } from '../../config/env.js';
import type { LoginAttempts } from './login_attempts.js';
import type { RefreshOutcome, RefreshStore } from './refresh_store.js';

/**
 * A second implementation of {@link RefreshStore} that keeps families in a map.
 *
 * Exists for the same reason the in-memory repositories do: the auth service is then tested
 * against a real implementation of the port rather than a mock, without a Redis to hand. The
 * rotation and replay rules are mirrored exactly, so a test passing here means something about the
 * Redis one, whose Lua script is covered separately by the integration tier.
 *
 * @returns A store backed by process memory.
 */
export function create_in_memory_refresh_store(): RefreshStore {
  const families = new Map<string, string>();

  return {
    async start(family: string, jti: string): Promise<void> {
      families.set(family, jti);
    },

    async rotate(family: string, presented_jti: string, next_jti: string): Promise<RefreshOutcome> {
      const current = families.get(family);

      if (current === undefined) {
        return 'unknown';
      }

      if (current !== presented_jti) {
        families.delete(family);
        return 'reused';
      }

      families.set(family, next_jti);
      return 'rotated';
    },

    async revoke(family: string): Promise<void> {
      families.delete(family);
    },
  };
}

/**
 * A second implementation of {@link LoginAttempts} that counts in a map.
 *
 * The lock is expressed as a count against the configured maximum rather than a wall-clock
 * expiry, because a unit test that had to wait out a real lockout window would be a slow test that
 * proves nothing extra.
 *
 * @returns A counter backed by process memory.
 */
export function create_in_memory_login_attempts(): LoginAttempts {
  const failures = new Map<string, number>();

  return {
    async seconds_locked(username: string): Promise<number> {
      const count = failures.get(username.toLowerCase()) ?? 0;
      return count >= env.LOGIN_MAX_ATTEMPTS ? env.LOGIN_LOCKOUT_SECONDS : 0;
    },

    async record_failure(username: string): Promise<void> {
      const key = username.toLowerCase();
      failures.set(key, (failures.get(key) ?? 0) + 1);
    },

    async clear(username: string): Promise<void> {
      failures.delete(username.toLowerCase());
    },
  };
}
