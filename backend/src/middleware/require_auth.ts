import type { Request, RequestHandler } from 'express';
import { role_has, type Permission } from '@blotter/shared';
import { AppError } from '../lib/errors/app_error.js';
import { verify_access_token, type AccessClaims } from '../lib/auth/tokens.js';

/**
 * Pulls a bearer token out of the Authorization header.
 *
 * @param header - The raw header value, if any.
 * @returns The token, or `undefined` when the header is absent or not a bearer.
 */
function bearer_token(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token !== undefined && token.length > 0
    ? token
    : undefined;
}

/**
 * Requires a valid access token.
 *
 * Mounted once, across the whole API prefix, with the public routes deliberately mounted ahead of
 * it. That ordering is what makes protection the default: a route added after this line is
 * authenticated without anyone remembering to say so, which is the opposite of an allowlist of
 * guarded routes that someone eventually forgets to extend.
 */
export const require_auth: RequestHandler = (req, _res, next) => {
  const token = bearer_token(req.headers.authorization);

  if (token === undefined) {
    next(AppError.unauthenticated());
    return;
  }

  const claims = verify_access_token(token);

  if (claims === null) {
    next(AppError.unauthenticated('The access token is not valid'));
    return;
  }

  req.auth = claims;
  next();
};

/**
 * Reads the claims a guarded handler can rely on.
 *
 * The request type marks `auth` optional, because the same type covers the public routes. This
 * turns that into a checked value rather than every handler repeating the same non-null assertion.
 *
 * @param req - The request, behind `require_auth`.
 * @returns The verified claims.
 * @throws {AppError} 401 when the guard did not run, which would be a wiring mistake rather than a
 * client one, but is still not something to answer with a 500 that leaks the detail.
 */
export function require_claims(req: Request): AccessClaims {
  if (req.auth === undefined) {
    throw AppError.unauthenticated();
  }

  return req.auth;
}

/**
 * Requires one named permission.
 *
 * The check is on the permission rather than the role, so a route states what it needs and the
 * mapping from role to permission stays in one place. Comparing against a role at the call site is
 * how `role === 'admin'` ends up scattered through a codebase.
 *
 * @param permission - The permission the route requires.
 * @returns Middleware that refuses anyone without it.
 */
export function require_permission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const claims = req.auth;

    if (claims === undefined) {
      next(AppError.unauthenticated());
      return;
    }

    if (!role_has(claims.role, permission)) {
      next(AppError.forbidden(`This action requires the ${permission} permission`));
      return;
    }

    next();
  };
}
