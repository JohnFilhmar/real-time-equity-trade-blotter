import type { NewUser, StoredUser, UserRepository } from '../interfaces/user_repository.js';

/**
 * A second implementation of {@link UserRepository} that keeps everything in a map.
 *
 * Exists for the same reason the in-memory trade repository does: the auth service and the routes
 * are then tested against a real implementation of the port rather than a mock, without needing a
 * database.
 *
 * @param initial - Users to start with. Defaults to empty.
 * @returns A repository backed by process memory.
 */
export function create_in_memory_user_repository(initial: StoredUser[] = []): UserRepository {
  const by_id = new Map<string, StoredUser>(initial.map((user) => [user.id, user]));

  return {
    async find_by_username(username: string): Promise<StoredUser | null> {
      return [...by_id.values()].find((user) => user.username === username) ?? null;
    },

    async find_by_id(id: string): Promise<StoredUser | null> {
      return by_id.get(id) ?? null;
    },

    async create(user: NewUser): Promise<StoredUser> {
      const stored: StoredUser = { id: crypto.randomUUID(), ...user };
      by_id.set(stored.id, stored);
      return stored;
    },

    async update_password_hash(id: string, password_hash: string): Promise<void> {
      const user = by_id.get(id);
      if (user !== undefined) {
        by_id.set(id, { ...user, passwordHash: password_hash });
      }
    },

    async count(): Promise<number> {
      return by_id.size;
    },
  };
}
