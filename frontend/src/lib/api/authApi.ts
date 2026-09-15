import {
  auth_session_schema,
  auth_user_schema,
  type AuthSession,
  type AuthUser,
  type LoginRequest,
} from '@blotter/shared';
import { api_json, api_void } from './http';

const prefix = '/api/v1/auth';

/**
 * Exchanges credentials for a session. The refresh token arrives as an httpOnly cookie.
 *
 * @param credentials - Username and password.
 * @returns The access token, its lifetime, and the signed-in user.
 * @throws {ApiError} 401 on bad credentials, 429 when the account is locked or the address is
 * rate limited. Both 429s carry the wait from their `Retry-After` header as `retry_after_seconds`.
 */
export function login(credentials: LoginRequest): Promise<AuthSession> {
  return api_json(`${prefix}/login`, auth_session_schema, {
    method: 'POST',
    body: credentials,
  });
}

/**
 * Rotates the refresh cookie for a new access token.
 *
 * Called on page load to restore a session without storing the access token anywhere script can
 * read it, and again shortly before each access token expires.
 *
 * @returns A fresh session.
 * @throws {ApiError} 401 when there is no usable cookie.
 */
export function refresh(): Promise<AuthSession> {
  return api_json(`${prefix}/refresh`, auth_session_schema, {
    method: 'POST',
  });
}

/**
 * Reads the signed-in user and their permissions.
 *
 * @param token - The access token.
 * @returns The user.
 */
export function me(token: string): Promise<AuthUser> {
  return api_json(`${prefix}/me`, auth_user_schema, { token });
}

/**
 * Ends the session on the server and clears the refresh cookie.
 *
 * @param token - The access token.
 */
export function logout(token: string): Promise<void> {
  return api_void(`${prefix}/logout`, { method: 'POST', token });
}
