'use client';

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { FieldError } from '@/components/ui/FieldError';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { as_api_error } from '@/lib/api/http';
import { format_lockout, lockout_seconds_from_detail } from '@/lib/auth/lockout';
import { useSession } from '@/providers/session_provider';

/** Where the sign-in is: waiting for a person, sending their credentials, or handing over. */
type Phase = 'idle' | 'sending' | 'opening';

const button_copy: Record<Phase, string> = {
  idle: 'Sign in to the desk',
  sending: 'Signing in',
  opening: 'Opening the desk',
};

const handshake_copy: Record<Phase, string> = {
  idle: '',
  sending: 'Credentials sent',
  opening: `Session adopted ${'·'} opening the desk`,
};

/**
 * The sign-in form. Desk credentials only: there is no registration, because a trader code is
 * issued by the desk rather than self-claimed.
 *
 * Three things happen around the two fields. Caps Lock is reported in the password field's own
 * message line, because five failures lock the account and a stuck Caps Lock is the commonest
 * cause. A lockout answer from the API becomes a countdown in the reserved error line and holds
 * the button until it ends. And the button and the line beneath it say what is happening after
 * submit, each state tied to a real event rather than a timer.
 *
 * @returns The form.
 */
export function LoginForm(): ReactNode {
  const { login } = useSession();
  const [username, set_username] = useState('');
  const [password, set_password] = useState('');
  const [caps_lock, set_caps_lock] = useState(false);
  const [problem, set_problem] = useState<string | null>(null);
  const [phase, set_phase] = useState<Phase>('idle');
  const [locked_until, set_locked_until] = useState<number | null>(null);
  const [now, set_now] = useState(() => Date.now());

  useEffect(() => {
    if (locked_until === null) {
      return;
    }
    const timer = setInterval(() => {
      const current = Date.now();
      if (current >= locked_until) {
        set_locked_until(null);
        return;
      }
      set_now(current);
    }, 1000);
    return () => clearInterval(timer);
  }, [locked_until]);

  const seconds_left = locked_until === null ? 0 : Math.max(0, Math.ceil((locked_until - now) / 1000));
  const locked = seconds_left > 0;

  const submit = async (): Promise<void> => {
    set_problem(null);
    set_phase('sending');
    try {
      await login({ username: username.trim(), password });
      set_phase('opening');
    } catch (error) {
      const api_error = as_api_error(error);
      const seconds = api_error === null ? null : lockout_seconds_from_detail(api_error.detail);
      if (seconds === null) {
        set_problem(api_error === null ? 'Something went wrong. Try again.' : api_error.detail);
      } else {
        const started = Date.now();
        set_now(started);
        set_locked_until(started + seconds * 1000);
      }
      set_phase('idle');
    }
  };

  const read_caps_lock = (event: KeyboardEvent<HTMLInputElement>): void => {
    set_caps_lock(event.getModifierState('CapsLock'));
  };

  const message = locked ? `Too many failed attempts. Try again in ${format_lockout(seconds_left)}.` : problem;

  return (
    <form
      className="flex flex-col gap-[14px] animate-fade"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field id="login_username" label="Username" error={undefined}>
        <Input id="login_username" name="username" autoComplete="username" spellCheck={false} autoFocus value={username} onChange={(event) => set_username(event.target.value)} />
      </Field>

      <Field id="login_password" label="Password" error={undefined} warning={caps_lock ? 'Caps Lock is on' : undefined}>
        <PasswordInput
          id="login_password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => set_password(event.target.value)}
          onKeyDown={read_caps_lock}
          onKeyUp={read_caps_lock}
        />
      </Field>

      <FieldError message={message} lines={2} />

      <Button type="submit" variant="primary" block className="h-[38px]" disabled={phase !== 'idle' || locked || username.length === 0 || password.length === 0}>
        {button_copy[phase]}
      </Button>

      <div role="status" aria-live="polite" className="min-h-[16px] font-mono text-[10.5px] text-brand-lo">
        {handshake_copy[phase]}
      </div>

      <p className="m-0 text-[11.5px] leading-[1.6] text-text-2">
        Demo accounts <span className="font-mono text-text">jsmith</span>, <span className="font-mono text-text">abrown</span>,{' '}
        <span className="font-mono text-text">mjones</span>, <span className="font-mono text-text">viewer</span>. Password in the README.
      </p>
    </form>
  );
}
