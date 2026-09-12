import { randomUUID } from 'node:crypto';
import { permissions_for, type AuthSession, type AuthUser, type LoginRequest } from '@blotter/shared';
import { env } from '../config/env.js';
import type { StoredUser, UserRepository } from '../interfaces/user_repository.js';
import { AppError } from '../lib/errors/app_error.js';
import type { LoginAttempts } from '../lib/auth/login_attempts.js';
import type { RefreshStore } from '../lib/auth/refresh_store.js';
import { verify_password } from '../lib/auth/password.js';
import {
  sign_access_token,
  sign_refresh_token,
  verify_refresh_token,
} from '../lib/auth/tokens.js';
import { logger } from '../lib/logging/logger.js';

/**
 * A bcrypt hash of a value nobody knows.
 *
 * Compared against when the username does not exist, so a login for a missing account costs the
 * same as one for a real account with the wrong password. Without it, response time tells an
 * attacker which usernames are real.
 */
const dummy_hash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.xEjKjHkCE1BQYY0OlcQJHFLBRR7dM3O';

/** What a successful login or refresh produces. */
export interface AuthResult {
  /** The part the client receives in the response body. */
  session: AuthSession;

  /** The refresh token, which the route puts in an httpOnly cookie rather than the body. */
  refresh_token: string;
}

/** Authentication and session lifecycle. */
export interface AuthService {
  /**
   * Exchanges credentials for a session.
   *
   * @param credentials - Username and password.
   * @returns The session and its refresh token.
   * @throws {AppError} 401 for any credential failure, 429 when the account is locked out.
   */
  login(credentials: LoginRequest): Promise<AuthResult>;

  /**
   * Exchanges a refresh token for a new session, rotating the token.
   *
   * @param refresh_token - The token from the cookie, if there was one.
   * @returns The new session and its replacement refresh token.
   * @throws {AppError} 401 when the token is missing, expired, forged, or already used.
   */
  refresh(refresh_token: string | undefined): Promise<AuthResult>;

  /**
   * Ends the session family the token belongs to.
   *
   * Succeeds even when the token is absent or already invalid: logging out is not an operation a
   * client should have to handle the failure of.
   *
   * @param refresh_token - The token from the cookie, if there was one.
   */
  logout(refresh_token: string | undefined): Promise<void>;

  /**
   * Reads the current user, for the `me` endpoint.
   *
   * @param user_id - The subject of the access token.
   * @returns The user as the client sees them.
   * @throws {AppError} 401 when the account has gone since the token was issued.
   */
  current_user(user_id: string): Promise<AuthUser>;
}

/**
 * Converts a stored user into the shape the client receives.
 *
 * The password hash is dropped here, and this is the only path from storage to a response, so it
 * cannot be serialised by accident.
 *
 * @param user - The stored user.
 * @returns The user as the client sees them, with permissions expanded from the role.
 */
export function to_auth_user(user: StoredUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    traderCode: user.traderCode,
    role: user.role,
    permissions: [...permissions_for(user.role)],
  };
}

/**
 * Builds the authentication service.
 *
 * @param users - Persistence port for accounts.
 * @param refresh_store - Where session families are tracked.
 * @param attempts - Per-account failure counter.
 * @returns The service.
 */
export function create_auth_service(
  users: UserRepository,
  refresh_store: RefreshStore,
  attempts: LoginAttempts,
): AuthService {
  /**
   * Mints an access token and a fresh refresh token for a user.
   *
   * @param user - The authenticated user.
   * @param family - The session family, new on login and carried through on refresh.
   * @returns The session and the refresh token.
   */
  function issue(user: StoredUser, family: string): { result: AuthResult; jti: string } {
    const refresh = sign_refresh_token(user.id, family);

    const access_token = sign_access_token({
      sub: user.id,
      username: user.username,
      trader_code: user.traderCode,
      role: user.role,
    });

    return {
      result: {
        session: {
          accessToken: access_token,
          expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
          user: to_auth_user(user),
        },
        refresh_token: refresh.token,
      },
      jti: refresh.jti,
    };
  }

  return {
    async login(credentials: LoginRequest): Promise<AuthResult> {
      const locked_for = await attempts.seconds_locked(credentials.username);

      if (locked_for > 0) {
        throw AppError.locked_out(locked_for);
      }

      const user = await users.find_by_username(credentials.username);
      const matched = await verify_password(credentials.password, user?.passwordHash ?? dummy_hash);

      if (user === null || !matched) {
        await attempts.record_failure(credentials.username);
        logger.warn({ username: credentials.username }, 'login_failed');
        throw AppError.unauthenticated('Username or password is incorrect');
      }

      await attempts.clear(credentials.username);

      const family = randomUUID();
      const { result, jti } = issue(user, family);
      await refresh_store.start(family, jti);

      logger.info({ user_id: user.id, role: user.role }, 'login_succeeded');
      return result;
    },

    async refresh(refresh_token: string | undefined): Promise<AuthResult> {
      if (refresh_token === undefined || refresh_token.length === 0) {
        throw AppError.unauthenticated('No refresh token was supplied');
      }

      const claims = verify_refresh_token(refresh_token);

      if (claims === null) {
        throw AppError.unauthenticated('The refresh token is not valid');
      }

      const user = await users.find_by_id(claims.sub);

      if (user === null) {
        await refresh_store.revoke(claims.family);
        throw AppError.unauthenticated('The refresh token is not valid');
      }

      const { result, jti } = issue(user, claims.family);
      const outcome = await refresh_store.rotate(claims.family, claims.jti, jti);

      if (outcome === 'reused') {
        // A token that had already been rotated came back. The family is gone by now; say nothing
        // more to the client than that the token is invalid.
        logger.warn({ user_id: user.id, family: claims.family }, 'refresh_token_reuse_detected');
        throw AppError.unauthenticated('The refresh token is not valid');
      }

      if (outcome === 'unknown') {
        throw AppError.unauthenticated('The refresh token is not valid');
      }

      return result;
    },

    async logout(refresh_token: string | undefined): Promise<void> {
      if (refresh_token === undefined || refresh_token.length === 0) {
        return;
      }

      const claims = verify_refresh_token(refresh_token);

      if (claims !== null) {
        await refresh_store.revoke(claims.family);
      }
    },

    async current_user(user_id: string): Promise<AuthUser> {
      const user = await users.find_by_id(user_id);

      if (user === null) {
        throw AppError.unauthenticated('The account on this token no longer exists');
      }

      return to_auth_user(user);
    },
  };
}
