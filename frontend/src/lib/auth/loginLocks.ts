import { z } from 'zod';

/** The localStorage key holding the sign-in locks this browser has been told about. */
export const login_locks_storage_key = 'blotter_login_locks';

/** What the store writes: lock expiries in epoch milliseconds, keyed by trimmed, lower-cased username. */
const stored_locks_schema = z.record(z.string(), z.number());

/**
 * Account lockouts this browser has been told about, remembered per username so a reload or a later
 * visit to the login page resumes the countdown instead of offering a sign-in the API will refuse.
 *
 * The API counts failures against the lower-cased username, so the key here is the trimmed,
 * lower-cased username too. Storage is a convenience and may be refused. Every method tolerates
 * that, and a copy held in memory keeps a lock for the life of the page.
 */
export interface LoginLocks {
  /**
   * Looks up an unexpired lock.
   *
   * @param username - As typed. Case and surrounding spaces are ignored.
   * @param now - The current time, in epoch milliseconds.
   * @returns When the lock ends, in epoch milliseconds, or `null` when there is none or it has run out.
   */
  read(username: string, now: number): number | null;

  /**
   * Records a lock, and drops any that have run out.
   *
   * @param username - As typed. A blank name records nothing.
   * @param expires_at - When the lock ends, in epoch milliseconds.
   * @param now - The current time, in epoch milliseconds.
   */
  remember(username: string, expires_at: number, now: number): void;

  /**
   * Removes a lock, and drops any that have run out.
   *
   * @param username - As typed.
   * @param now - The current time, in epoch milliseconds.
   */
  forget(username: string, now: number): void;

  /**
   * Subscribes to changes made through this store or by another tab, in the shape
   * `useSyncExternalStore` expects.
   *
   * @param on_change - Called after every change.
   * @returns The unsubscribe function.
   */
  subscribe(on_change: () => void): () => void;
}

/**
 * Normalises a username the way the API keys its lockout.
 *
 * @param username - As typed.
 * @returns The trimmed, lower-cased name.
 */
function lock_key(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Reads stored locks. Anything this store could not have written counts as no locks at all.
 *
 * @param raw - The stored string, or `null` when nothing is stored.
 * @returns The locks by key.
 */
function parse_locks(raw: string | null): Map<string, number> {
  if (raw === null) {
    return new Map();
  }
  try {
    const parsed = stored_locks_schema.safeParse(JSON.parse(raw));
    return new Map(parsed.success ? Object.entries(parsed.data) : []);
  } catch {
    return new Map();
  }
}

/**
 * Builds a lock store over a storage area.
 *
 * @param get_storage - Returns the storage to use. Called on every access and allowed to throw, as
 * `window.localStorage` does when site data is blocked.
 * @returns The store.
 */
export function create_login_locks(get_storage: () => Storage): LoginLocks {
  const listeners = new Set<() => void>();
  let in_memory = new Map<string, number>();

  const load = (): Map<string, number> => {
    let locks = new Map<string, number>();
    try {
      locks = parse_locks(get_storage().getItem(login_locks_storage_key));
    } catch {
      // Storage refused the read, so the in-memory copy merged below is the only record.
    }
    for (const [name, expires_at] of in_memory) {
      locks.set(name, Math.max(locks.get(name) ?? expires_at, expires_at));
    }
    return locks;
  };

  const save = (locks: Map<string, number>, now: number): void => {
    for (const [name, expires_at] of locks) {
      if (expires_at <= now) {
        locks.delete(name);
      }
    }
    in_memory = locks;
    try {
      get_storage().setItem(login_locks_storage_key, JSON.stringify(Object.fromEntries(locks)));
    } catch {
      // Storage refused the write. The in-memory copy still holds the lock for this page.
    }
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    read(username, now) {
      const expires_at = load().get(lock_key(username));
      return expires_at !== undefined && expires_at > now ? expires_at : null;
    },

    remember(username, expires_at, now) {
      const key = lock_key(username);
      if (key.length === 0) {
        return;
      }
      const locks = load();
      locks.set(key, expires_at);
      save(locks, now);
    },

    forget(username, now) {
      const locks = load();
      locks.delete(lock_key(username));
      save(locks, now);
    },

    subscribe(on_change) {
      const on_storage = (event: StorageEvent): void => {
        if (event.key === null || event.key === login_locks_storage_key) {
          on_change();
        }
      };
      listeners.add(on_change);
      window.addEventListener('storage', on_storage);
      return () => {
        listeners.delete(on_change);
        window.removeEventListener('storage', on_storage);
      };
    },
  };
}

/** The browser's lock store, kept in `localStorage`. */
export const login_locks: LoginLocks = create_login_locks(() => window.localStorage);
