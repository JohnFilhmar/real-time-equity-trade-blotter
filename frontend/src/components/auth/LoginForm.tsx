'use client';

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { login_request_schema, type ProblemFieldError } from '@blotter/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { FieldError } from '@/components/ui/FieldError';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { as_api_error } from '@/lib/api/http';
import { format_lockout, seconds_until } from '@/lib/auth/lockout';
import { login_locks } from '@/lib/auth/loginLocks';
import { useSession } from '@/providers/SessionProvider';

/** Where the sign-in is: waiting for a person, sending their credentials, or handing over. */
type Phase = 'idle' | 'sending' | 'opening';

/** The message under each input, when there is one. */
type FieldMessages = Partial<Record<'username' | 'password', string>>;

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
 * Keeps the first message for each input. The shared schema checks its rules in order and the API
 * lists its issues in that order too, so the first message is the most basic problem.
 *
 * @param errors - Field errors from the schema, or from the API's validation problem.
 * @returns At most one message per input. Errors about anything else are left out.
 */
function to_field_messages(errors: readonly ProblemFieldError[]): FieldMessages {
  const messages: FieldMessages = {};
  for (const error of errors) {
    if ((error.field === 'username' || error.field === 'password') && messages[error.field] === undefined) {
      messages[error.field] = error.message;
    }
  }
  return messages;
}

/**
 * The sign-in form. Desk credentials only: there is no registration, because a trader code is
 * issued by the desk rather than self-claimed.
 *
 * Validation runs the shared login schema before anything is sent, and a 422 from the API lands in
 * the same place, so the message under a field reads the same whichever side caught the mistake.
 * Caps Lock is reported in the password field's own message line, because five failures lock the
 * account and a stuck Caps Lock is the commonest cause. A lockout answer becomes a countdown in the
 * reserved error line and holds the button until it ends; the lock is remembered against the
 * username in this browser, so a reload, or typing that name again later, brings the countdown
 * back. And the button and the line beneath it say what is happening after submit, each state tied
 * to a real event rather than a timer.
 *
 * @returns The form.
 */
export function LoginForm(): ReactNode {
  const { login } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [capsLock, setCapsLock] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldMessages, setFieldMessages] = useState<FieldMessages>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [now, setNow] = useState(() => Date.now());
  const locked_until = useSyncExternalStore(
    login_locks.subscribe,
    () => login_locks.read(username, now),
    () => null,
  );

  useEffect(() => {
    if (locked_until === null) {
      return;
    }
    const timer = setInterval(() => {
      const current = Date.now();
      if (current >= locked_until) {
        login_locks.forget(username, current);
      }
      setNow(current);
    }, 1000);
    return () => clearInterval(timer);
  }, [locked_until, username]);

  const seconds_left = locked_until === null ? 0 : seconds_until(locked_until, now);
  const locked = seconds_left > 0;

  // Validates, then sends; a refusal becomes a remembered countdown, messages under the fields, or
  // the reserved error line, depending on what the API said.
  const submit = async (): Promise<void> => {
    setProblem(null);
    const parsed = login_request_schema.safeParse({ username, password });
    if (!parsed.success) {
      setFieldMessages(to_field_messages(parsed.error.issues.map((issue) => ({ field: String(issue.path[0]), message: issue.message }))));
      return;
    }

    setFieldMessages({});
    setPhase('sending');
    try {
      await login(parsed.data);
      setPhase('opening');
    } catch (error) {
      setPhase('idle');
      const api_error = as_api_error(error);
      if (api_error === null) {
        setProblem('Something went wrong. Try again.');
        return;
      }

      const wait_seconds = api_error.status === 429 ? api_error.retry_after_seconds : null;
      if (wait_seconds !== null && wait_seconds > 0) {
        const started = Date.now();
        login_locks.remember(parsed.data.username, started + wait_seconds * 1000, started);
        setNow(started);
        return;
      }

      const messages = api_error.code === 'validation_failed' ? to_field_messages(api_error.errors) : {};
      if (Object.keys(messages).length > 0) {
        setFieldMessages(messages);
        return;
      }
      setProblem(api_error.detail);
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
      <Field id="login_username" label="Username" error={fieldMessages.username}>
        <Input
          id="login_username"
          name="username"
          autoComplete="username"
          spellCheck={false}
          autoFocus
          value={username}
          invalid={fieldMessages.username !== undefined}
          onChange={(event) => {
            setUsername(event.target.value);
            setNow(Date.now());
            setFieldMessages((current) => ({ ...current, username: undefined }));
          }}
        />
      </Field>

      <Field id="login_password" label="Password" error={fieldMessages.password} warning={capsLock ? 'Caps Lock is on' : undefined}>
        <PasswordInput
          id="login_password"
          name="password"
          autoComplete="current-password"
          value={password}
          invalid={fieldMessages.password !== undefined}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldMessages((current) => ({ ...current, password: undefined }));
          }}
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
