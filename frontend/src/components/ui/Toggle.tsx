import type { ReactNode } from 'react';

/** Which semantic colour a pressed toggle takes. */
export type ToggleTone = 'brand' | 'gain' | 'loss';

/** Props for {@link Toggle}. */
export interface ToggleProps {
  pressed: boolean;
  onToggle: () => void;
  /** Colour when pressed. `gain` for BUY, `loss` for SELL, `brand` otherwise. */
  tone?: ToggleTone;
  /** Accessible label when the visible text is abbreviated. */
  label?: string;
  children: ReactNode;
}

const pressed_classes: Record<ToggleTone, string> = {
  brand: 'bg-brand-bg border-brand-edge text-brand-lo',
  gain: 'bg-gain-bg border-gain-edge-hi text-gain',
  loss: 'bg-loss-bg border-loss-edge-hi text-loss',
};

/**
 * A pressable pill that reports its state through `aria-pressed`. Used for side and status
 * filters and the side picker on the ticket.
 *
 * @param props - Pressed state, toggle handler, tone and label.
 * @returns A button element.
 */
export function Toggle({ pressed, onToggle, tone = 'brand', label, children }: ToggleProps): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onToggle}
      className={`h-[33px] rounded-r border font-mono text-[11.5px] font-semibold tracking-[.06em] transition-all duration-150 ${
        pressed ? pressed_classes[tone] : 'border-rule bg-sunk text-muted hover:text-text-2'
      }`}
    >
      {children}
    </button>
  );
}
