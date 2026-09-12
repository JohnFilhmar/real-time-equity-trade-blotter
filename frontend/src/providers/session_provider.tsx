'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthSession, LoginRequest } from '@blotter/shared';
import { login as login_request, logout as logout_request, refresh } from '@/lib/api/auth_api';
import { as_api_error } from '@/lib/api/http';
import type { SessionContextValue, SessionState } from '@/types/session';

const SessionContext = createContext<SessionContextValue | null>(null);

/** How long before the access token expires the next refresh is scheduled, in seconds. */
const refresh_lead_seconds = 60;

/**
 * Owns the session: the access token in memory, the user, and the refresh schedule.
 *
 * On mount it calls the refresh endpoint once. The refresh token is an httpOnly cookie the page
 * cannot read, so this is the only way to find out whether someone is already signed in, and it
 * means the access token is never written to storage. Each session then schedules its own
 * refresh a minute before expiry, so a tab left open stays signed in without a visible reload.
 *
 * @param props - The subtree.
 * @returns The provider.
 */
export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, set_session] = useState<SessionState>({ status: 'restoring', user: null, token: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query_client = useQueryClient();

  const clear_timer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const forget = useCallback(() => {
    clear_timer();
    set_session({ status: 'anonymous', user: null, token: null });
    query_client.clear();
  }, [clear_timer, query_client]);

  // The scheduled refresh has to call the same adopt function that scheduled it, which a
  // useCallback cannot name from inside its own body, so the timer reaches it through a ref.
  const adopt_ref = useRef<(established: AuthSession) => void>(() => undefined);

  const adopt = useCallback(
    (established: AuthSession) => {
      clear_timer();
      set_session({ status: 'authenticated', user: established.user, token: established.accessToken });

      const delay_seconds = Math.max(established.expiresIn - refresh_lead_seconds, 15);
      timer.current = setTimeout(() => {
        refresh()
          .then((next) => adopt_ref.current(next))
          .catch(() => {
            forget();
          });
      }, delay_seconds * 1000);
    },
    [clear_timer, forget],
  );

  useEffect(() => {
    adopt_ref.current = adopt;
  }, [adopt]);

  // One restore per mount, even when React runs the effect twice in development. Both runs share
  // the same in-flight request rather than each sending one, which matters because the credential
  // endpoints are rate limited.
  const restore = useRef<Promise<AuthSession> | null>(null);

  useEffect(() => {
    let cancelled = false;
    restore.current ??= refresh();

    restore.current
      .then((established) => {
        if (!cancelled) {
          adopt(established);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        // 401 is the normal "nobody is signed in" answer. Anything else still lands on the login
        // screen, where a failed attempt will say what is wrong.
        if (as_api_error(error) === null) {
          console.error(error);
        }
        set_session({ status: 'anonymous', user: null, token: null });
      });

    return () => {
      cancelled = true;
      clear_timer();
    };
  }, [adopt, clear_timer]);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      adopt(await login_request(credentials));
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    const token = session.token;
    forget();
    if (token !== null) {
      await logout_request(token).catch(() => undefined);
    }
  }, [forget, session.token]);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Reads the session.
 *
 * @returns The session state and the sign-in and sign-out actions.
 * @throws {Error} When used outside the provider.
 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}

/**
 * Reads the access token from inside the authenticated part of the tree.
 *
 * @returns The token.
 * @throws {Error} When nobody is signed in, which means a component was mounted outside the
 * session gate. That is a wiring mistake rather than a runtime condition.
 */
export function useAccessToken(): string {
  const { session } = useSession();
  if (session.status !== 'authenticated') {
    throw new Error('useAccessToken requires an authenticated session');
  }
  return session.token;
}
