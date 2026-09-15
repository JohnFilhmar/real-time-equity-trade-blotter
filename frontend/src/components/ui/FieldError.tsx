import type { ReactNode } from 'react';

/** Props for {@link FieldError}. */
export interface FieldErrorProps {
  /** The message to show, or nothing. The row keeps its height either way. */
  message: string | null | undefined;
  /** Two lines of reserved height for messages that can wrap, such as a server's conflict detail. */
  lines?: 1 | 2;
}

/**
 * A form-level error line whose space is reserved before there is an error, so the form does not
 * move when one appears. The container is the live region, always present, so assistive tech
 * announces the message when it lands rather than a new node being inserted.
 *
 * @param props - The message and how many lines to reserve.
 * @returns The line.
 */
export function FieldError({ message, lines = 1 }: FieldErrorProps): ReactNode {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`text-[12px] leading-[1.4] text-loss ${lines === 2 ? 'min-h-8.5' : 'min-h-4.25'}`}
    >
      {message ?? ''}
    </div>
  );
}
