import type { AuthUser, LoginRequest } from '@blotter/shared';

/**
 * The session as the interface sees it.
 *
 * `restoring` covers the first refresh call on page load, so the login screen is not flashed at
 * someone who is already signed in. The access token is held here, in memory, and nowhere else.
 */
export type SessionState =
  | { status: 'restoring'; user: null; token: null }
  | { status: 'anonymous'; user: null; token: null }
  | { status: 'authenticated'; user: AuthUser; token: string };

/** What the session provider exposes. */
export interface SessionContextValue {
  session: SessionState;

  /** Signs in. Resolves when the session is established; rejects with the API error otherwise. */
  login: (credentials: LoginRequest) => Promise<void>;

  /** Signs out on the server and forgets the session locally. Never rejects. */
  logout: () => Promise<void>;
}
