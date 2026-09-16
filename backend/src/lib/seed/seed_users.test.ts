import { describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import type { NewUser, StoredUser, UserRepository } from '../../interfaces/user_repository.js';
import { verify_password } from '../auth/password.js';
import { seed_users_if_empty } from './seed_users.js';

/**
 * A user store that counts and inserts, which is all seeding touches.
 *
 * The lookups and the hash replacement belong to the port, so they are present and throw. A seed
 * that reached for one would be doing something these tests have not described.
 */
class FakeUserRepository implements UserRepository {
  readonly created: NewUser[] = [];

  constructor(private readonly already_stored = 0) {}

  async count(): Promise<number> {
    return this.already_stored + this.created.length;
  }

  async create(user: NewUser): Promise<StoredUser> {
    this.created.push(user);
    return { ...user, id: `user-${this.created.length.toString()}` };
  }

  async find_by_username(): Promise<StoredUser | null> {
    throw new Error('seeding does not look users up');
  }

  async find_by_id(): Promise<StoredUser | null> {
    throw new Error('seeding does not look users up');
  }

  async update_password_hash(): Promise<void> {
    throw new Error('seeding does not replace hashes');
  }
}

describe('seed_users_if_empty', () => {
  it('creates the four demo accounts in an empty database', async () => {
    const users = new FakeUserRepository();

    await expect(seed_users_if_empty(users)).resolves.toBe(4);
    expect(users.created.map((user) => user.username)).toEqual(['jsmith', 'abrown', 'mjones', 'viewer']);
  });

  it('gives every account the configured seed password', async () => {
    const users = new FakeUserRepository();
    await seed_users_if_empty(users);

    for (const user of users.created) {
      await expect(verify_password(env.SEED_USER_PASSWORD, user.passwordHash)).resolves.toBe(true);
    }
  });

  it('issues the three roles a reviewer signs in with', async () => {
    const users = new FakeUserRepository();
    await seed_users_if_empty(users);

    expect(users.created.map((user) => [user.username, user.role])).toEqual([
      ['jsmith', 'TRADER'],
      ['abrown', 'TRADER'],
      ['mjones', 'ADMIN'],
      ['viewer', 'VIEWER'],
    ]);
  });

  it('creates nothing when an account already exists, so a changed seed password never reaches a populated database', async () => {
    const users = new FakeUserRepository(1);

    await expect(seed_users_if_empty(users)).resolves.toBe(0);
    expect(users.created).toEqual([]);
  });
});
