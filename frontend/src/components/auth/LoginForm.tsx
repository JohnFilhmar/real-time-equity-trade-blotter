'use client';

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { FieldError } from '@/components/ui/FieldError';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { as_api_error } from '@/lib/api/http';
import { format_lockout, lockout_seconds_from_detail } from '@/lib/auth/lockout';
import { useSession } from '@/providers/SessionProvider';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [capsLock, setCapsLock] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lockedUntil === null) {
      return;
    }
    const timer = setInterval(() => {
      const current = Date.now();
      if (current >= lockedUntil) {
        setLockedUntil(null);
        return;
      }
      setNow(current);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const seconds_left = lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = seconds_left > 0;

  const submit = async (): Promise<void> => {
    setProblem(null);
    setPhase('sending');
    try {
      await login({ username: username.trim(), password });
      setPhase('opening');
    } catch (error) {
      const api_error = as_api_error(error);
      const seconds = api_error === null ? null : lockout_seconds_from_detail(api_error.detail);
      if (seconds === null) {
        setProblem(api_error === null ? 'Something went wrong. Try again.' : api_error.detail);
      } else {
        const started = Date.now();
        setNow(started);
        setLockedUntil(started + seconds * 1000);
      }
      setPhase('idle');
    }
  };

  const read_caps_lock = (event: KeyboardEvent<HTMLInputElement>): void => {
    setCapsLock(event.getModifierState('CapsLock'));
  };

  const message = locked ? `Too many failed attempts. Try again in ${format_lockout(seconds_left)}.` : problem;

  return (
    <form
      className="flex flex-col gap-3.5 animate-fade"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field id="login_username" label="Username" error={undefined}>
        <Input id="login_username" name="username" autoComplete="username" spellCheck={false} autoFocus value={username} onChange={(event) => setUsername(event.target.value)} />
      </Field>

      <Field id="login_password" label="Password" error={undefined} warning={capsLock ? 'Caps Lock is on' : undefined}>
        <PasswordInput
          id="login_password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={read_caps_lock}
          onKeyUp={read_caps_lock}
        />
      </Field>

      <FieldError message={message} lines={2} />

      <Button type="submit" variant="primary" block className="h-9.5" disabled={phase !== 'idle' || locked || username.length === 0 || password.length === 0}>
        {button_copy[phase]}
      </Button>

      <div role="status" aria-live="polite" className="min-h-4 font-mono text-[10.5px] text-brand-lo">
        {handshake_copy[phase]}
      </div>

      <p className="m-0 text-[11.5px] leading-[1.6] text-text-2">
        Demo accounts <span className="font-mono text-text">jsmith</span>, <span className="font-mono text-text">abrown</span>,{' '}
        <span className="font-mono text-text">mjones</span>, <span className="font-mono text-text">viewer</span>. Password in the README.
      </p>
    </form>
  );
}
