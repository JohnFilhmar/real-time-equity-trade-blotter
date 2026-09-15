import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth_session_schema } from '@blotter/shared';
import { api_prefix } from '../app.js';
import { env } from '../config/env.js';
import { hash_password } from '../lib/auth/password.js';
import { build_test_app, type TestApp } from '../lib/testing/test_app.js';
import { refresh_cookie_name } from './auth_routes.js';

const password = 'a-real-enough-password';

/**
 * Builds an app with one account already in it.
 *
 * @returns The test app.
 */
async function with_user(): Promise<TestApp> {
  const context = build_test_app();

  await context.users.create({
    username: 'jsmith',
    passwordHash: await hash_password(password),
    displayName: 'J. Smith',
    traderCode: 'JSMITH',
    role: 'TRADER',
  });

  return context;
}

/**
 * Pulls the refresh cookie out of a response.
 *
 * @param header - The set-cookie header, however supertest presented it.
 * @returns The cookie string, ready to send back.
 */
function refresh_cookie(header: string[] | string | undefined): string {
  const cookies = Array.isArray(header) ? header : [header ?? ''];
  return cookies.find((cookie) => cookie.startsWith(refresh_cookie_name)) ?? '';
}

describe(`POST ${api_prefix}/auth/login`, () => {
  it('is reachable without a token, unlike everything else', async () => {
    const { app } = await with_user();

    const response = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password });

    expect(response.status).toBe(200);
    expect(() => auth_session_schema.parse(response.body)).not.toThrow();
  });

  it('puts the refresh token in an httpOnly cookie, never in the body', async () => {
    const { app } = await with_user();

    const response = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password });

    const cookie = refresh_cookie(response.headers['set-cookie']);

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain(`Path=${api_prefix}/auth`);
    expect(JSON.stringify(response.body)).not.toContain('blotter_refresh');
  });

  it('answers the same way for a wrong password and a missing account', async () => {
    const { app } = await with_user();

    const wrong = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password: 'nope' });
    const missing = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'nobody', password });

    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(missing.body.detail).toBe(wrong.body.detail);
  });

  it('rejects a malformed username rather than looking it up', async () => {
    const { app } = await with_user();

    const response = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'a user with spaces', password });

    expect(response.status).toBe(422);
  });

  it('tells a locked account how long to wait in a Retry-After header, not only in the detail', async () => {
    const { app } = await with_user();
    const failures: Array<{ status: number; retry_after: unknown }> = [];

    for (let attempt = 0; attempt < env.LOGIN_MAX_ATTEMPTS; attempt += 1) {
      const response = await request(app)
        .post(`${api_prefix}/auth/login`)
        .send({ username: 'jsmith', password: 'nope' });
      failures.push({ status: response.status, retry_after: response.headers['retry-after'] });
    }

    const locked = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password });

    expect(failures).toEqual(
      Array.from({ length: env.LOGIN_MAX_ATTEMPTS }, () => ({ status: 401, retry_after: undefined })),
    );
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('locked_out');
    expect(locked.headers['retry-after']).toBe(env.LOGIN_LOCKOUT_SECONDS.toString());
    expect(locked.body.detail).toBe(
      `Too many failed attempts. Try again in ${env.LOGIN_LOCKOUT_SECONDS.toString()} seconds.`,
    );
  });
});

describe(`POST ${api_prefix}/auth/refresh`, () => {
  it('exchanges the cookie for a new session', async () => {
    const { app } = await with_user();
    const login = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password });

    const response = await request(app)
      .post(`${api_prefix}/auth/refresh`)
      .set('Cookie', refresh_cookie(login.headers['set-cookie']));

    expect(response.status).toBe(200);
    expect(() => auth_session_schema.parse(response.body)).not.toThrow();
  });

  it('refuses when no cookie is sent', async () => {
    const { app } = await with_user();

    const response = await request(app).post(`${api_prefix}/auth/refresh`);

    expect(response.status).toBe(401);
  });

  it('burns the session when a used cookie comes back', async () => {
    const { app } = await with_user();
    const login = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password });
    const first_cookie = refresh_cookie(login.headers['set-cookie']);

    const rotated = await request(app)
      .post(`${api_prefix}/auth/refresh`)
      .set('Cookie', first_cookie);
    const second_cookie = refresh_cookie(rotated.headers['set-cookie']);

    const replay = await request(app)
      .post(`${api_prefix}/auth/refresh`)
      .set('Cookie', first_cookie);
    const after_replay = await request(app)
      .post(`${api_prefix}/auth/refresh`)
      .set('Cookie', second_cookie);

    expect(replay.status).toBe(401);
    expect(after_replay.status).toBe(401);
  });
});

describe(`${api_prefix}/auth/me and logout`, () => {
  it('needs a token, because they sit behind the guard', async () => {
    const { app } = await with_user();

    expect((await request(app).get(`${api_prefix}/auth/me`)).status).toBe(401);
    expect((await request(app).post(`${api_prefix}/auth/logout`)).status).toBe(401);
  });

  it('describes the signed-in user, permissions included', async () => {
    const { app } = await with_user();
    const login = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password });

    const response = await request(app)
      .get(`${api_prefix}/auth/me`)
      .set('Authorization', `Bearer ${String(login.body.accessToken)}`);

    expect(response.status).toBe(200);
    expect(response.body.traderCode).toBe('JSMITH');
    expect(response.body.permissions).toContain('trade.create');
    expect(response.body.permissions).not.toContain('trade.cancel.any');
  });

  it('ends the session, so the refresh cookie stops working', async () => {
    const { app } = await with_user();
    const login = await request(app)
      .post(`${api_prefix}/auth/login`)
      .send({ username: 'jsmith', password });
    const cookie = refresh_cookie(login.headers['set-cookie']);

    const logout = await request(app)
      .post(`${api_prefix}/auth/logout`)
      .set('Authorization', `Bearer ${String(login.body.accessToken)}`)
      .set('Cookie', cookie);

    const after = await request(app).post(`${api_prefix}/auth/refresh`).set('Cookie', cookie);

    expect(logout.status).toBe(204);
    expect(after.status).toBe(401);
  });
});
