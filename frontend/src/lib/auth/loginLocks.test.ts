import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create_login_locks, login_locks_storage_key } from './loginLocks';

/**
 * Reads back what the store wrote, so a test can check the stored shape directly.
 *
 * @returns The parsed entry, or `null` when nothing is stored.
 */
function stored(): unknown {
  const raw = window.localStorage.getItem(login_locks_storage_key);
  return raw === null ? null : JSON.parse(raw);
}

describe('login locks', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('remembers a lock under the trimmed, lower-cased username, so any casing finds it', () => {
    const locks = create_login_locks(() => window.localStorage);

    locks.remember('  JSmith ', 900_000, 0);

    expect(stored()).toEqual({ jsmith: 900_000 });
    expect(locks.read('jsmith', 1_000)).toBe(900_000);
    expect(locks.read('JSMITH ', 1_000)).toBe(900_000);
  });

  it('outlives the page, because a fresh store reads the same entry', () => {
    create_login_locks(() => window.localStorage).remember('jsmith', 900_000, 0);

    expect(create_login_locks(() => window.localStorage).read('jsmith', 1_000)).toBe(900_000);
  });

  it('reports nothing for another username, or once the lock has run out', () => {
    const locks = create_login_locks(() => window.localStorage);

    locks.remember('jsmith', 900_000, 0);

    expect(locks.read('abrown', 1_000)).toBeNull();
    expect(locks.read('jsmith', 900_000)).toBeNull();
  });

  it('drops expired entries whenever it writes', () => {
    const locks = create_login_locks(() => window.localStorage);

    locks.remember('jsmith', 5_000, 0);
    locks.remember('abrown', 900_000, 6_000);

    expect(stored()).toEqual({ abrown: 900_000 });
  });

  it('forgets a lock', () => {
    const locks = create_login_locks(() => window.localStorage);

    locks.remember('jsmith', 900_000, 0);
    locks.forget('JSmith', 1_000);

    expect(locks.read('jsmith', 1_000)).toBeNull();
    expect(stored()).toEqual({});
  });

  it('treats stored content it could not have written as no locks at all', () => {
    const locks = create_login_locks(() => window.localStorage);

    window.localStorage.setItem(login_locks_storage_key, 'not json');
    expect(locks.read('jsmith', 0)).toBeNull();

    window.localStorage.setItem(login_locks_storage_key, JSON.stringify({ jsmith: 'soon', abrown: 900_000 }));
    expect(locks.read('jsmith', 0)).toBeNull();
    expect(locks.read('abrown', 0)).toBeNull();

    locks.remember('jsmith', 900_000, 0);
    expect(stored()).toEqual({ jsmith: 900_000 });
  });

  it('keeps the lock for the life of the page when storage is refused outright', () => {
    const locks = create_login_locks(() => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    });

    expect(() => locks.remember('jsmith', 900_000, 0)).not.toThrow();
    expect(locks.read('jsmith', 1_000)).toBe(900_000);

    locks.forget('jsmith', 1_000);
    expect(locks.read('jsmith', 1_000)).toBeNull();
  });

  it('keeps the lock for the life of the page when only the write is refused', () => {
    const locks = create_login_locks(() => window.localStorage);
    const set_item = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });

    locks.remember('jsmith', 900_000, 0);
    set_item.mockRestore();

    expect(stored()).toBeNull();
    expect(locks.read('jsmith', 1_000)).toBe(900_000);
  });

  it('tells subscribers about its own writes and about changes made in another tab', () => {
    const locks = create_login_locks(() => window.localStorage);
    const listener = vi.fn();
    const unsubscribe = locks.subscribe(listener);

    locks.remember('jsmith', 900_000, 0);
    window.dispatchEvent(new StorageEvent('storage', { key: login_locks_storage_key }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'blotter_theme' }));

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    locks.forget('jsmith', 1_000);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
