'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { FieldError } from '@/components/ui/FieldError';
import { Note } from '@/components/ui/Note';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { as_api_error } from '@/lib/api/http';
import { useSession } from '@/providers/session_provider';

/**
 * The sign-in card. Desk credentials only: there is no registration, because a trader code is
 * issued by the desk rather than self-claimed.
 *
 * @returns The form.
 */
export function LoginForm(): ReactNode {
  const { login } = useSession();
  const router = useRouter();
  const [username, set_username] = useState('');
  const [password, set_password] = useState('');
  const [problem, set_problem] = useState<string | null>(null);
  const [pending, set_pending] = useState(false);

  const submit = async (): Promise<void> => {
    set_problem(null);
    set_pending(true);
    try {
      await login({ username: username.trim(), password });
      router.replace('/');
    } catch (error) {
      const api_error = as_api_error(error);
      set_problem(api_error === null ? 'Something went wrong. Try again.' : api_error.detail);
    } finally {
      set_pending(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-6">
      <form
        className="flex w-full max-w-[372px] flex-col gap-4 rounded-[12px] border border-glass-edge bg-glass p-[26px] shadow-glass backdrop-blur-[22px] backdrop-saturate-150"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-[10px]">
          <div className="grid h-6 w-6 place-items-center rounded-[6px] bg-linear-145 from-brand-grad-hi to-brand-grad-lo text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
          </div>
          <div>
            <b className="text-[15px] font-semibold">Fusion Blotter</b>
            <div className="mt-[2px] font-mono text-[10px] uppercase tracking-[.12em] text-faint">Equity cash {'·'} London desk</div>
          </div>
        </div>

        <p className="m-0 text-[12.5px] leading-[1.6] text-muted">
          Desk credentials. Your trader code stamps every trade you book, amend or cancel.
        </p>

        <Field id="login_username" label="Username" error={undefined}>
          <Input id="login_username" name="username" autoComplete="username" spellCheck={false} autoFocus value={username} onChange={(event) => set_username(event.target.value)} />
        </Field>

        <Field id="login_password" label="Password" error={undefined}>
          <PasswordInput id="login_password" name="password" autoComplete="current-password" value={password} onChange={(event) => set_password(event.target.value)} />
        </Field>

        <FieldError message={problem} lines={2} />

        <Button type="submit" variant="primary" block className="h-[38px]" disabled={pending || username.length === 0 || password.length === 0}>
          {pending ? 'Signing in' : 'Sign in to the desk'}
        </Button>

        <Note>
          Demo accounts: <span className="font-mono">jsmith</span> and <span className="font-mono">abrown</span> (traders),{' '}
          <span className="font-mono">mjones</span> (desk head), <span className="font-mono">viewer</span> (read only). The shared demo
          password is in the README.
        </Note>
      </form>
    </div>
  );
}
