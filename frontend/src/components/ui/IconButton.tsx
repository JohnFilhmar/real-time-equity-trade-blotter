import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

/** Props for {@link IconButton}. */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the icon carries no text, so the label is what assistive tech reads. */
  label: string;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

/**
 * A 28px square button holding one icon.
 *
 * @param props - The accessible label, the icon, and any native button attribute.
 * @returns A button element.
 */
export function IconButton({ label, className = '', type = 'button', ref, children, ...rest }: IconButtonProps): ReactNode {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-glass-soft hover:text-brand-lo ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
