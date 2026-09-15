'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { control_classes } from './Field';

/** Props for {@link PasswordInput}: any native input attribute except `type`, which it owns. */
export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  invalid?: boolean;
};

/**
 * A password field with a reveal control.
 *
 * Masked by default, never auto-revealed, and the revealed state is not persisted anywhere: it is
 * component state that dies with the field. The control is a real button with `aria-pressed` and a
 * name that changes with state, so assistive tech reads "Show password, not pressed". It sits
 * outside the tab order so Tab goes from the field straight to the submit button; a keyboard user
 * reaches it with Shift+Tab or a pointer, and never has it between them and signing in.
 *
 * Revealing is recommended rather than risky on a desk: masking drives typos, and typos drive
 * the lockout that the API enforces after five failures.
 *
 * @param props - Native input attributes plus `invalid`.
 * @returns The field and its reveal button.
 */
export function PasswordInput({ invalid = false, className = '', ...rest }: PasswordInputProps): ReactNode {
  const [revealed, setRevealed] = useState(false);
  const Icon = revealed ? EyeOff : Eye;

  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        className={`${control_classes} pr-9 ${className}`}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-pressed={revealed}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        title={revealed ? 'Hide password' : 'Show password'}
        onClick={() => setRevealed((current) => !current)}
        className="absolute top-1/2 right-1.5 grid h-5.5 w-5.5 -translate-y-1/2 place-items-center rounded-[5px] text-muted transition-colors hover:bg-glass-soft hover:text-brand-lo focus-visible:outline-2 focus-visible:outline-brand"
      >
        <Icon size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
