import { z } from 'zod';
import { permission_values, role_values } from '../reference/roles.js';

/**
 * Credentials for the login endpoint.
 *
 * Both fields are bounded. An unbounded password field is a cheap way to make a slow hash
 * comparison much slower, which is the shape of a denial-of-service rather than a login.
 */
export const login_request_schema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'username may use letters, digits, dot, underscore and dash'),
  password: z.string().min(1).max(200),
});

/**
 * The signed-in user, as the client sees them.
 *
 * Permissions travel with the user so the interface can hide what the person cannot do. That is a
 * convenience for the interface only: the server re-checks every permission on every request, and
 * a client that edits this list gets a 403 rather than an outcome.
 */
export const auth_user_schema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  traderCode: z.string().min(1).max(32),
  role: z.enum(role_values),
  permissions: z.array(z.enum(permission_values)),
});

/**
 * What login and refresh both answer.
 *
 * The refresh token is not in here. It travels as an httpOnly cookie, so no script on the page can
 * read the long-lived credential; only the short-lived access token reaches JavaScript.
 */
export const auth_session_schema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.int().positive(),
  user: auth_user_schema,
});

/** Credentials for the login endpoint. */
export type LoginRequest = z.infer<typeof login_request_schema>;

/** The signed-in user, as the client sees them. */
export type AuthUser = z.infer<typeof auth_user_schema>;

/** What login and refresh both answer. */
export type AuthSession = z.infer<typeof auth_session_schema>;
