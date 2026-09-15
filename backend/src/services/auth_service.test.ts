import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth_session_schema, type Role } from '@blotter/shared';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors/app_error.js';
import { hash_password } from '../lib/auth/password.js';
import {
  create_in_memory_login_attempts,
  create_in_memory_refresh_store,
} from '../lib/auth/in_memory_auth_stores.js';
import type { RefreshStore } from '../lib/auth/refresh_store.js';
import { create_in_memory_user_repository } from '../repositories/in_memory_user_repository.js';
import type { UserRepository } from '../interfaces/user_repository.js';
import { create_auth_service, type AuthService } from './auth_service.js';

const password = 'a-real-enough-password';

describe('auth service', () => {
  let users: UserRepository;
  let refresh_store: RefreshStore;
  let service: AuthService;

  /**
   * Creates an account to sign in as.
   *
   * @param username - The login name.
   * @param role - The role it holds.
   * @param traderCode - The desk code.
   */
  async function given_user(username: string, role: Role = 'TRADER', traderCode = 'JSMITH') {
    return users.create({
      username,
      passwordHash: await hash_password(password),
      displayName: username,
      traderCode,
      role,
    });
  }

  /**
   * Signs in with a wrong password five times, the configured limit, and keeps each refusal.
   *
   * @param username - The account to attempt, which need not exist.
   * @returns The status and code of each refusal, in order. Anything that is not an `AppError` is
   * kept as it was thrown, so an assertion shows it.
   */
  async function five_wrong_passwords(username: string): Promise<unknown[]> {
    const outcomes: unknown[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const outcome = await service.login({ username, password: 'wrong' }).catch((error: unknown) => error);
      outcomes.push(outcome instanceof AppError ? { status: outcome.status, code: outcome.code } : outcome);
    }
    return outcomes;
  }

  /** Four refusals for the credentials, then the lockout on the failure that reaches the limit. */
  const locked_on_the_fifth = [
    ...Array.from({ length: 4 }, () => ({ status: 401, code: 'unauthenticated' })),
    { status: 429, code: 'locked_out' },
  ];

  beforeEach(() => {
    users = create_in_memory_user_repository();
    refresh_store = create_in_memory_refresh_store();
    service = create_auth_service(users, refresh_store, create_in_memory_login_attempts());
  });

  describe('login', () => {
    it('answers a session the client contract recognises', async () => {
      await given_user('jsmith');

      const { session, refresh_token } = await service.login({ username: 'jsmith', password });

      expect(() => auth_session_schema.parse(session)).not.toThrow();
      expect(refresh_token.length).toBeGreaterThan(0);
    });

    it('never puts the refresh token in the session body', async () => {
      await given_user('jsmith');

      const { session, refresh_token } = await service.login({ username: 'jsmith', password });

      expect(JSON.stringify(session)).not.toContain(refresh_token);
    });

    it('never exposes the password hash', async () => {
      await given_user('jsmith');

      const { session } = await service.login({ username: 'jsmith', password });

      expect(JSON.stringify(session)).not.toContain('$2b$');
    });

    it('expands the role into the permissions the interface can read', async () => {
      await given_user('viewer', 'VIEWER', 'VIEWER');

      const { session } = await service.login({ username: 'viewer', password });

      expect(session.user.permissions).toEqual(['trade.read']);
    });

    it('rejects a wrong password', async () => {
      await given_user('jsmith');

      await expect(
        service.login({ username: 'jsmith', password: 'wrong' }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('answers a missing account exactly as it answers a wrong password', async () => {
      await given_user('jsmith');

      const wrong_password = await service
        .login({ username: 'jsmith', password: 'wrong' })
        .catch((error: unknown) => error);
      const no_such_user = await service
        .login({ username: 'nobody', password })
        .catch((error: unknown) => error);

      expect(wrong_password).toBeInstanceOf(AppError);
      expect(no_such_user).toBeInstanceOf(AppError);

      if (wrong_password instanceof AppError && no_such_user instanceof AppError) {
        expect(no_such_user.status).toBe(wrong_password.status);
        expect(no_such_user.message).toBe(wrong_password.message);
      }
    });

    it('locks the account on the failure that reaches the limit', async () => {
      await given_user('jsmith');

      expect(await five_wrong_passwords('jsmith')).toEqual(locked_on_the_fifth);

      // Even the correct password is refused once the account is locked.
      await expect(service.login({ username: 'jsmith', password })).rejects.toMatchObject({
        status: 429,
        code: 'locked_out',
      });
    });

    it('locks a username with no account on the same failure, so a lock reveals nothing', async () => {
      await given_user('jsmith');

      expect(await five_wrong_passwords('nobody')).toEqual(locked_on_the_fifth);
    });

    it('clears the failure count on a successful login', async () => {
      await given_user('jsmith');

      await service.login({ username: 'jsmith', password: 'wrong' }).catch(() => undefined);
      await service.login({ username: 'jsmith', password });

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await service.login({ username: 'jsmith', password: 'wrong' }).catch(() => undefined);
      }

      await expect(service.login({ username: 'jsmith', password })).resolves.toBeDefined();
    });
  });

  describe('hash cost', () => {
    /**
     * Creates an account whose stored hash was made at a cost other than the configured one, as an
     * account seeded before BCRYPT_ROUNDS changed would be.
     *
     * @param username - The login name.
     * @returns The stored user.
     */
    async function given_user_hashed_at_another_cost(username: string) {
      return users.create({
        username,
        passwordHash: await bcrypt.hash(password, 4),
        displayName: username,
        traderCode: 'JSMITH',
        role: 'TRADER',
      });
    }

    it('rehashes a stored hash made at another cost when the password is correct', async () => {
      const user = await given_user_hashed_at_another_cost('jsmith');

      await service.login({ username: 'jsmith', password });

      const stored = await users.find_by_id(user.id);
      expect(stored === null ? null : bcrypt.getRounds(stored.passwordHash)).toBe(env.BCRYPT_ROUNDS);
      await expect(service.login({ username: 'jsmith', password })).resolves.toBeDefined();
    });

    it('leaves a hash already at the configured cost untouched', async () => {
      const user = await given_user('jsmith');

      await service.login({ username: 'jsmith', password });

      expect((await users.find_by_id(user.id))?.passwordHash).toBe(user.passwordHash);
    });

    it('never rehashes on a wrong password', async () => {
      const user = await given_user_hashed_at_another_cost('jsmith');

      await service.login({ username: 'jsmith', password: 'wrong' }).catch(() => undefined);

      expect((await users.find_by_id(user.id))?.passwordHash).toBe(user.passwordHash);
    });

    it('still signs the person in when storing the new hash fails', async () => {
      await given_user_hashed_at_another_cost('jsmith');
      const failing: UserRepository = {
        ...users,
        update_password_hash: async () => {
          throw new Error('the database went away');
        },
      };
      const unlucky = create_auth_service(failing, refresh_store, create_in_memory_login_attempts());

      await expect(unlucky.login({ username: 'jsmith', password })).resolves.toBeDefined();
    });
  });

  describe('refresh', () => {
    it('exchanges a refresh token for a new session', async () => {
      await given_user('jsmith');
      const first = await service.login({ username: 'jsmith', password });

      const second = await service.refresh(first.refresh_token);

      expect(() => auth_session_schema.parse(second.session)).not.toThrow();
      expect(second.session.user.username).toBe('jsmith');
    });

    it('rotates the token, so the old one stops working', async () => {
      await given_user('jsmith');
      const first = await service.login({ username: 'jsmith', password });

      const second = await service.refresh(first.refresh_token);

      expect(second.refresh_token).not.toBe(first.refresh_token);
    });

    it('revokes the whole family when a used token comes back', async () => {
      await given_user('jsmith');
      const first = await service.login({ username: 'jsmith', password });
      const second = await service.refresh(first.refresh_token);

      // The replay. This is the signal that a token was stolen.
      await expect(service.refresh(first.refresh_token)).rejects.toMatchObject({ status: 401 });

      // And the legitimate holder is signed out too, which is the point: the session is burned.
      await expect(service.refresh(second.refresh_token)).rejects.toMatchObject({ status: 401 });
    });

    it('refuses a missing token', async () => {
      await expect(service.refresh(undefined)).rejects.toMatchObject({ status: 401 });
      await expect(service.refresh('')).rejects.toMatchObject({ status: 401 });
    });

    it('refuses a token that is not one of ours', async () => {
      await expect(service.refresh('not-a-token')).rejects.toMatchObject({ status: 401 });
    });

    it('refuses a valid token whose account has gone', async () => {
      const user = await given_user('jsmith');
      const { refresh_token } = await service.login({ username: 'jsmith', password });

      // A fresh store with no such account, standing in for a deleted user.
      const orphaned = create_auth_service(
        create_in_memory_user_repository(),
        refresh_store,
        create_in_memory_login_attempts(),
      );

      expect(user.id.length).toBeGreaterThan(0);
      await expect(orphaned.refresh(refresh_token)).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('logout', () => {
    it('ends the session, so the refresh token stops working', async () => {
      await given_user('jsmith');
      const { refresh_token } = await service.login({ username: 'jsmith', password });

      await service.logout(refresh_token);

      await expect(service.refresh(refresh_token)).rejects.toMatchObject({ status: 401 });
    });

    it('does not complain about a missing or invalid token', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      await expect(service.logout('not-a-token')).resolves.toBeUndefined();
    });
  });

  describe('current user', () => {
    it('returns the account behind a token', async () => {
      const user = await given_user('jsmith', 'ADMIN', 'MJONES');

      const current = await service.current_user(user.id);

      expect(current.username).toBe('jsmith');
      expect(current.role).toBe('ADMIN');
      expect(current.traderCode).toBe('MJONES');
    });

    it('refuses when the account has gone since the token was issued', async () => {
      await expect(
        service.current_user('3f2504e0-4f89-41d3-9a0c-0305e82c3301'),
      ).rejects.toMatchObject({ status: 401 });
    });
  });
});
