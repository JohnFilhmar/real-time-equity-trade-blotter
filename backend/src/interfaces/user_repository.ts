import type { Role } from '@blotter/shared';

/**
 * A user as stored.
 *
 * Carries the password hash, which is why it never leaves the service layer: everything the client
 * sees goes through `to_auth_user`, and this type exists so the hash cannot be serialised by
 * accident.
 */
export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  traderCode: string;
  role: Role;
}

/** A user to create, with the password already hashed. */
export type NewUser = Omit<StoredUser, 'id'>;

/** Persistence port for users. */
export interface UserRepository {
  /**
   * Looks a user up for login.
   *
   * @param username - The supplied username.
   * @returns The user, or `null` when there is no such account.
   */
  find_by_username(username: string): Promise<StoredUser | null>;

  /**
   * Looks a user up by id, used when a refresh token names one.
   *
   * @param id - The user id from the token.
   * @returns The user, or `null` when the account has since gone.
   */
  find_by_id(id: string): Promise<StoredUser | null>;

  /**
   * Inserts a user.
   *
   * @param user - The user to create, password already hashed.
   * @returns The stored user.
   */
  create(user: NewUser): Promise<StoredUser>;

  /**
   * Counts the accounts that exist, so seeding can tell an empty system from a populated one.
   *
   * @returns The number of users.
   */
  count(): Promise<number>;
}
