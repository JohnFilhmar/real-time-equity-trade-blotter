import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { role_values } from '@blotter/shared';
import { env } from '../../config/env.js';

/**
 * The one algorithm this service signs and accepts.
 *
 * Pinned on verification as well as signing. `jsonwebtoken` will otherwise trust the algorithm
 * named in the token's own header, which is how a token signed with `none`, or an HMAC forged
 * against a public key, gets accepted.
 */
const algorithm = 'HS256' as const;

/** Who issued the token and who it is for, checked on every verification. */
const issuer = 'blotter-api';
const audience = 'blotter-client';

/** Claims carried by an access token. */
const access_claims_schema = z.object({
  sub: z.uuid(),
  username: z.string().min(1),
  trader_code: z.string().min(1),
  role: z.enum(role_values),
});

/** Claims carried by a refresh token. */
const refresh_claims_schema = z.object({
  sub: z.uuid(),
  family: z.uuid(),
  jti: z.uuid(),
});

/** The verified contents of an access token. */
export type AccessClaims = z.infer<typeof access_claims_schema>;

/** The verified contents of a refresh token. */
export type RefreshClaims = z.infer<typeof refresh_claims_schema>;

/** A freshly minted refresh token and the identifiers the store needs to track it. */
export interface IssuedRefreshToken {
  token: string;
  family: string;
  jti: string;
}

/**
 * Signs a short-lived access token.
 *
 * @param claims - Who the token is for and what they are.
 * @returns The signed token.
 */
export function sign_access_token(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm,
    issuer,
    audience,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

/**
 * Signs a refresh token, minting a new id for it.
 *
 * @param user_id - Who the token is for.
 * @param family - The session family it belongs to. A new login starts a new family.
 * @returns The token and the identifiers to record against it.
 */
export function sign_refresh_token(user_id: string, family: string): IssuedRefreshToken {
  const jti = randomUUID();

  const token = jwt.sign({ sub: user_id, family, jti }, env.JWT_REFRESH_SECRET, {
    algorithm,
    issuer,
    audience,
    expiresIn: env.REFRESH_TOKEN_TTL_SECONDS,
  });

  return { token, family, jti };
}

/**
 * Verifies an access token.
 *
 * The decoded payload is parsed with a schema rather than trusted, because a valid signature only
 * proves this service issued the string, not that the string still has the shape this version of
 * the code expects.
 *
 * @param token - The bearer token.
 * @returns The claims, or `null` when the token is missing, expired, forged or malformed.
 */
export function verify_access_token(token: string): AccessClaims | null {
  return verify(token, env.JWT_ACCESS_SECRET, access_claims_schema);
}

/**
 * Verifies a refresh token.
 *
 * @param token - The refresh token from the cookie.
 * @returns The claims, or `null` when the token is missing, expired, forged or malformed.
 */
export function verify_refresh_token(token: string): RefreshClaims | null {
  return verify(token, env.JWT_REFRESH_SECRET, refresh_claims_schema);
}

/**
 * Verifies a token and narrows its payload with a schema.
 *
 * Every failure returns `null` rather than throwing a distinguishable error, so a caller cannot
 * accidentally tell a client which of the several reasons applied.
 *
 * @param token - The token to check.
 * @param secret - The signing secret for its kind.
 * @param schema - The claims this kind of token must carry.
 * @returns The parsed claims, or `null`.
 */
function verify<T>(token: string, secret: string, schema: z.ZodType<T>): T | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: [algorithm], issuer, audience });
    const parsed = schema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
