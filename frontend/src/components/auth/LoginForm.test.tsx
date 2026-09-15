import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginRequest } from '@blotter/shared';
import { ApiError } from '@/lib/api/http';
import { login_locks, login_locks_storage_key } from '@/lib/auth/loginLocks';
import { LoginForm } from './LoginForm';

const { login } = vi.hoisted(() => ({
  login: vi.fn<(credentials: LoginRequest) => Promise<void>>(),
}));

vi.mock('@/providers/SessionProvider', () => ({
  useSession: () => ({
    session: { status: 'anonymous', user: null, token: null },
    login,
    logout: () => Promise.resolve(),
  }),
}));

/** Every username these tests type, so each test can clear the locks it leaves in the shared store. */
const usernames = ['jsmith', 'abrown'];

/**
 * Finds the form's submit button.
 *
 * @returns The Sign in button.
 */
function sign_in_button(): HTMLElement {
  return screen.getByRole('button', { name: 'Sign in to the desk' });
}

/**
 * Types into both boxes, as a person would.
 *
 * @param username - Text for the username box.
 * @param password - Text for the password box.
 */
function type_credentials(username: string, password: string): void {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

/** Presses Sign in and lets the answer, a refusal or a session, settle into the form. */
async function press_sign_in(): Promise<void> {
  await act(async () => {
    fireEvent.click(sign_in_button());
  });
}

/**
 * Builds the refusal the API sends as a 429.
 *
 * @param code - `locked_out` for the account lock, `rate_limited` for the per-address limit.
 * @param retry_after_seconds - The Retry-After wait, or `null` when the header was absent.
 * @returns The error the session's login rejects with.
 */
function too_many(code: 'locked_out' | 'rate_limited', retry_after_seconds: number | null): ApiError {
  return new ApiError(429, code, 'Too many requests.', [], undefined, retry_after_seconds);
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
    login.mockReset();
  });

  afterEach(() => {
    cleanup();
    for (const username of usernames) {
      login_locks.forget(username, Date.now());
    }
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('remembers an account lock against the username and counts it down', async () => {
    login.mockRejectedValue(too_many('locked_out', 900));
    render(<LoginForm />);

    type_credentials('jsmith', 'not-the-password');
    await press_sign_in();

    expect(screen.getByRole('alert')).toHaveTextContent('Too many failed attempts. Try again in 15:00.');
    expect(sign_in_button()).toBeDisabled();
    expect(login_locks.read('jsmith', Date.now())).toBe(Date.now() + 900_000);
  });

  it('holds Sign in for the address limit whatever username is typed, and remembers nothing', async () => {
    login.mockRejectedValue(too_many('rate_limited', 42));
    render(<LoginForm />);

    type_credentials('jsmith', 'not-the-password');
    await press_sign_in();

    expect(screen.getByRole('alert')).toHaveTextContent('Too many sign-in attempts from this network. Try again in 0:42.');
    expect(sign_in_button()).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'abrown' } });

    expect(sign_in_button()).toBeDisabled();
    expect(login_locks.read('jsmith', Date.now())).toBeNull();
    expect(window.localStorage.getItem(login_locks_storage_key)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(42_000);
    });

    expect(sign_in_button()).toBeEnabled();
    expect(screen.getByRole('alert')).not.toHaveTextContent('Too many');
  });

  it('says the address limit lifts shortly when the API gives no wait, without holding Sign in', async () => {
    login.mockRejectedValue(too_many('rate_limited', null));
    render(<LoginForm />);

    type_credentials('jsmith', 'not-the-password');
    await press_sign_in();

    expect(screen.getByRole('alert')).toHaveTextContent('Too many sign-in attempts from this network. Try again shortly.');
    expect(sign_in_button()).toBeEnabled();
    expect(login_locks.read('jsmith', Date.now())).toBeNull();
  });
});
