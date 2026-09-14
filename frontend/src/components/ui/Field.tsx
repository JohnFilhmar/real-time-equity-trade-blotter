import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/** The shared look of every text-like control: 33px tall, sunk fill, brand ring on focus. */
export const control_classes =
  'h-[33px] w-full min-w-0 rounded-r border border-rule bg-sunk px-[10px] text-[12.5px] text-text placeholder:text-faint transition-[border-color,background-color] duration-150 focus:border-brand-edge focus:bg-inp-focus focus:outline-none focus:ring-[3px] focus:ring-brand-ring aria-invalid:border-loss-invalid disabled:opacity-50';

/** Props for {@link Field}. */
export interface FieldProps {
  /** Ties the label to the control. */
  id: string;
  label: string;
  /** Validation message; an empty string keeps the row height so the form does not jump. */
  error?: string | undefined;
  /** Explanatory line under the control when there is no error. */
  hint?: string | undefined;
  /** A caution shown in the warn tone when there is no error, such as Caps Lock being on. */
  warning?: string | undefined;
  children: ReactNode;
}

/**
 * A labelled form row: mono uppercase label, the control, and a message line.
 *
 * @param props - The label, the control, and the error, warning or hint line.
 * @returns The row.
 */
export function Field({ id, label, error, warning, hint, children }: FieldProps): ReactNode {
  const message_id = `${id}_message`;
  const tone = error ? 'text-loss' : warning ? 'text-warn' : 'text-muted';

  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <label htmlFor={id} className="font-mono text-[9.5px] uppercase tracking-[.11em] text-faint">
        {label}
      </label>
      {children}
      <div
        id={message_id}
        className={`flex min-h-[14px] items-center gap-[5px] text-[11px] ${tone}`}
        aria-live="polite"
      >
        {error ?? warning ?? hint ?? ''}
      </div>
    </div>
  );
}

/** Props for {@link Input}. */
export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

/**
 * A text-like input in the blotter's control style.
 *
 * @param props - Native input attributes plus `invalid`.
 * @returns An input element.
 */
export function Input({ invalid = false, className = '', ...rest }: InputProps): ReactNode {
  return <input aria-invalid={invalid || undefined} className={`${control_classes} ${className}`} {...rest} />;
}

/** Props for {@link Select}. */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

/**
 * A native select in the blotter's control style, with its own chevron.
 *
 * @param props - Native select attributes plus `invalid`.
 * @returns A select element.
 */
export function Select({ invalid = false, className = '', children, ...rest }: SelectProps): ReactNode {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`${control_classes} cursor-pointer appearance-none bg-[linear-gradient(45deg,transparent_50%,var(--muted)_50%),linear-gradient(135deg,var(--muted)_50%,transparent_50%)] bg-[length:5px_5px,5px_5px] bg-[position:calc(100%-15px)_14px,calc(100%-10px)_14px] bg-no-repeat pr-7 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
