import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** The looks a button can take. */
export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

/** Props for {@link Button}. */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Visual weight. `primary` is the one affirmative action on a surface. */
  variant?: ButtonVariant;

  /** Stretches to the container width. */
  block?: boolean;

  /** Why the button is disabled, shown as the tooltip and read by assistive tech. */
  disabled_reason?: string | null;

  children: ReactNode;
}

const variant_classes: Record<ButtonVariant, string> = {
  default:
    'bg-glass-soft border-rule text-text-2 hover:text-text hover:border-glass-edge hover:bg-glass',
  primary:
    'bg-linear-150 from-brand-btn-hi to-brand-btn-lo border-brand-edge text-brand-lo font-semibold hover:from-brand-btn-hi2 hover:to-brand-btn-lo2 hover:text-brand-hi',
  danger:
    'bg-loss-bg border-loss-edge-btn text-loss hover:bg-loss-hot hover:text-loss-hi hover:border-loss-edge-hot',
  ghost: 'bg-transparent border-transparent text-muted hover:text-text-2 hover:bg-glass-soft',
};

/**
 * The blotter's button. Thirty-one pixels tall, one of four variants, never raw utility classes at
 * the call site.
 *
 * @param props - Variant, block, the disabled reason, and any native button attribute.
 * @returns A button element.
 */
export function Button({
  variant = 'default',
  block = false,
  disabled_reason = null,
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps): ReactNode {
  const is_disabled = disabled === true || (disabled_reason !== null && disabled_reason.length > 0);

  return (
    <button
      type={type}
      disabled={is_disabled}
      aria-disabled={is_disabled}
      title={disabled_reason ?? rest.title}
      className={`inline-flex h-[31px] items-center justify-center gap-[7px] whitespace-nowrap rounded-r border px-[13px] text-[12.5px] font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${variant_classes[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
