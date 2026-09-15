import { describe, expect, it } from 'vitest';
import { login_request_schema } from './auth.js';

/**
 * Validates credentials and keeps the first message for each field, which is the one the login
 * form shows under that field.
 *
 * @param input - Candidate credentials, possibly incomplete.
 * @returns The first message per field. Empty when the credentials are valid.
 */
function first_messages(input: Record<string, unknown>): Record<string, string> {
  const parsed = login_request_schema.safeParse(input);
  const messages: Record<string, string> = {};

  if (parsed.success) {
    return messages;
  }

  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]);
    messages[field] ??= issue.message;
  }

  return messages;
}

describe('login_request_schema', () => {
  it('accepts desk credentials and trims the username', () => {
    expect(login_request_schema.parse({ username: '  jsmith ', password: 'FusionDemo!2026' })).toEqual({
      username: 'jsmith',
      password: 'FusionDemo!2026',
    });
  });

  it('asks for a username that is empty, only spaces, or missing', () => {
    expect(first_messages({ username: '', password: 'secret' })).toEqual({ username: 'Enter your username' });
    expect(first_messages({ username: '   ', password: 'secret' })).toEqual({ username: 'Enter your username' });
    expect(first_messages({ password: 'secret' })).toEqual({ username: 'Enter your username' });
  });

  it('allows 64 characters in a username and says so past that', () => {
    expect(login_request_schema.safeParse({ username: 'a'.repeat(64), password: 'secret' }).success).toBe(true);
    expect(first_messages({ username: 'a'.repeat(65), password: 'secret' })).toEqual({
      username: 'Username cannot be longer than 64 characters',
    });
  });

  it('names the characters a username can use', () => {
    expect(first_messages({ username: 'j smith', password: 'secret' })).toEqual({
      username: 'Username can only use letters, numbers, dots, underscores and dashes',
    });
  });

  it('asks for a password that is empty or missing', () => {
    expect(first_messages({ username: 'jsmith', password: '' })).toEqual({ password: 'Enter your password' });
    expect(first_messages({ username: 'jsmith' })).toEqual({ password: 'Enter your password' });
  });

  it('allows 200 characters in a password and says so past that', () => {
    expect(login_request_schema.safeParse({ username: 'jsmith', password: 'p'.repeat(200) }).success).toBe(true);
    expect(first_messages({ username: 'jsmith', password: 'p'.repeat(201) })).toEqual({
      password: 'Password cannot be longer than 200 characters',
    });
  });
});
