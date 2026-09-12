import { Router } from 'express';
import type { CookieOptions } from 'express';
import { login_request_schema } from '@blotter/shared';
import { env, is_production } from '../config/env.js';
import { auth_rate_limit } from '../middleware/rate_limit.js';
import { require_claims } from '../middleware/require_auth.js';
import type { AuthService } from '../services/auth_service.js';

/** The cookie the refresh token travels in. */
export const refresh_cookie_name = 'blotter_refresh';

/**
 * Where the refresh cookie is sent.
 *
 * Scoped to the auth routes so the long-lived credential is not attached to every trade request
 * the browser makes. A cookie that only travels where it is needed is one that leaks in fewer
 * places.
 */
const refresh_cookie_path = '/api/v1/auth';

/**
 * How the refresh cookie is set.
 *
 * `httpOnly` is the whole point: script on the page cannot read the long-lived credential, so an
 * injected script cannot walk off with a week of access. `sameSite: 'lax'` is enough while the
 * interface and the API share a site, which they do on localhost; a deployment that splits them
 * across domains would need `none` with `secure`, and that is recorded in the README rather than
 * guessed at here.
 */
function refresh_cookie_options(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || is_production,
    sameSite: 'lax',
    path: refresh_cookie_path,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

/**
 * Builds the routes that do not require a token.
 *
 * Mounted ahead of the authentication guard, which is what makes them public. Everything mounted
 * after the guard is protected without anyone having to remember to protect it.
 *
 * @param service - The authentication service.
 * @returns A router to mount under the API prefix.
 */
export function create_public_auth_router(service: AuthService): Router {
  const router = Router();

  router.post('/auth/login', auth_rate_limit, async (req, res) => {
    const credentials = login_request_schema.parse(req.body);
    const { session, refresh_token } = await service.login(credentials);

    res.cookie(refresh_cookie_name, refresh_token, refresh_cookie_options());
    res.status(200).json(session);
  });

  router.post('/auth/refresh', auth_rate_limit, async (req, res) => {
    const presented: unknown = req.cookies?.[refresh_cookie_name];
    const { session, refresh_token } = await service.refresh(
      typeof presented === 'string' ? presented : undefined,
    );

    res.cookie(refresh_cookie_name, refresh_token, refresh_cookie_options());
    res.status(200).json(session);
  });

  return router;
}

/**
 * Builds the routes that require a token.
 *
 * Logout lives here rather than on the public router so an unauthenticated caller cannot end
 * somebody else's session by presenting their cookie alone.
 *
 * @param service - The authentication service.
 * @returns A router to mount under the API prefix, behind the guard.
 */
export function create_auth_router(service: AuthService): Router {
  const router = Router();

  router.get('/auth/me', async (req, res) => {
    const claims = require_claims(req);
    res.json(await service.current_user(claims.sub));
  });

  router.post('/auth/logout', async (req, res) => {
    const presented: unknown = req.cookies?.[refresh_cookie_name];
    await service.logout(typeof presented === 'string' ? presented : undefined);

    res.clearCookie(refresh_cookie_name, { path: refresh_cookie_path });
    res.status(204).send();
  });

  return router;
}
