import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import {
  sign_access_token,
  sign_refresh_token,
  verify_access_token,
  verify_refresh_token,
} from './tokens.js';

const a_user = randomUUID();

const a_claim_set = {
  sub: a_user,
  username: 'jsmith',
  trader_code: 'JSMITH',
  role: 'TRADER',
} as const;

describe('access tokens', () => {
  it('round-trips the claims it was given', () => {
    const claims = verify_access_token(sign_access_token(a_claim_set));

    expect(claims).toMatchObject(a_claim_set);
  });

  it('refuses a token signed with another secret', () => {
    const forged = jwt.sign(a_claim_set, 'a-different-secret-entirely-0123456789', {
      algorithm: 'HS256',
      issuer: 'blotter-api',
      audience: 'blotter-client',
      expiresIn: 900,
    });

    expect(verify_access_token(forged)).toBeNull();
  });

  it('refuses a token that claims to need no signature', () => {
    // The `alg: none` attack. It only works against a verifier that trusts the algorithm named in
    // the token's own header, which is why the algorithm is pinned on verification.
    const unsigned = jwt.sign(a_claim_set, '', {
      algorithm: 'none',
      issuer: 'blotter-api',
      audience: 'blotter-client',
    });

    expect(verify_access_token(unsigned)).toBeNull();
  });

  it('refuses a token issued by something else', () => {
    const wrong_issuer = jwt.sign(
      a_claim_set,
      'test-access-secret-0123456789abcdefghijkl',
      { algorithm: 'HS256', issuer: 'somewhere-else', audience: 'blotter-client', expiresIn: 900 },
    );

    expect(verify_access_token(wrong_issuer)).toBeNull();
  });

  it('refuses a token that has expired', () => {
    const expired = jwt.sign(
      a_claim_set,
      'test-access-secret-0123456789abcdefghijkl',
      { algorithm: 'HS256', issuer: 'blotter-api', audience: 'blotter-client', expiresIn: -10 },
    );

    expect(verify_access_token(expired)).toBeNull();
  });

  it('refuses a correctly signed token whose claims are the wrong shape', () => {
    const wrong_shape = jwt.sign(
      { sub: a_user, username: 'jsmith', trader_code: 'JSMITH', role: 'SUPERUSER' },
      'test-access-secret-0123456789abcdefghijkl',
      { algorithm: 'HS256', issuer: 'blotter-api', audience: 'blotter-client', expiresIn: 900 },
    );

    expect(verify_access_token(wrong_shape)).toBeNull();
  });

  it('refuses a refresh token presented as an access token', () => {
    const { token } = sign_refresh_token(a_user, randomUUID());

    expect(verify_access_token(token)).toBeNull();
  });

  it('refuses nonsense', () => {
    expect(verify_access_token('not-a-token')).toBeNull();
    expect(verify_access_token('')).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('carries the family and a fresh id each time', () => {
    const family = randomUUID();
    const first = sign_refresh_token(a_user, family);
    const second = sign_refresh_token(a_user, family);

    expect(first.family).toBe(family);
    expect(second.family).toBe(family);
    expect(first.jti).not.toBe(second.jti);
  });

  it('round-trips its claims', () => {
    const family = randomUUID();
    const issued = sign_refresh_token(a_user, family);

    const claims = verify_refresh_token(issued.token);

    expect(claims?.sub).toBe(a_user);
    expect(claims?.family).toBe(family);
    expect(claims?.jti).toBe(issued.jti);
  });

  it('refuses an access token presented as a refresh token', () => {
    expect(verify_refresh_token(sign_access_token(a_claim_set))).toBeNull();
  });
});
