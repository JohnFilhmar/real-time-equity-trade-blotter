import type { ReactNode } from 'react';
import type { TradeSide, TradeStatus } from '@blotter/shared';

/**
 * The status badge: ACTIVE in the gain colour, CANCELLED in the loss colour.
 *
 * @param props - The status.
 * @returns A span.
 */
export function StatusBadge({ status }: { status: TradeStatus }): ReactNode {
  const tone = status === 'ACTIVE' ? 'bg-gain-bg text-gain shadow-[inset_0_0_0_1px_var(--gain_edge)]' : 'bg-loss-bg text-loss shadow-[inset_0_0_0_1px_var(--loss_edge)]';
  return (
    <span className={`whitespace-nowrap rounded-[3px] px-1.75 py-[2.5px] font-mono text-[9.5px] font-semibold tracking-[.07em] ${tone}`}>
      {status}
    </span>
  );
}

/**
 * The version pill an amended trade carries. Amendment is a version, not a status, so the badge
 * stays two-valued and this pill says how many times the trade moved.
 *
 * @param props - The trade's version. Renders nothing for version 1.
 * @returns A span, or `null`.
 */
export function VersionPill({ version }: { version: number }): ReactNode {
  if (version <= 1) {
    return null;
  }
  const times = version - 1;
  return (
    <span
      className="cursor-help rounded-[3px] bg-warn-bg px-1.25 py-[2.5px] font-mono text-[9.5px] font-semibold text-warn shadow-[inset_0_0_0_1px_var(--warn_edge)]"
      title={`Amended ${times.toString()} time${times === 1 ? '' : 's'}. Amendment is a version, not a status.`}
    >
      v{version}
    </span>
  );
}

/**
 * BUY or SELL, in its colour, in mono.
 *
 * @param props - The side.
 * @returns A span.
 */
export function SideMark({ side }: { side: TradeSide }): ReactNode {
  return (
    <span className={`font-mono text-[10.5px] font-semibold tracking-[.05em] ${side === 'BUY' ? 'text-gain' : 'text-loss'}`}>
      {side}
    </span>
  );
}

/**
 * A filter chip with an optional remove button.
 *
 * @param props - Label text, the bold value, and the remove handler when removable.
 * @returns A span.
 */
export function Chip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value?: ReactNode;
  onRemove?: (() => void) | undefined;
}): ReactNode {
  return (
    <span className="inline-flex h-6.5 items-center gap-1.5 whitespace-nowrap rounded-[13px] border border-rule bg-glass-soft px-2.25 text-[11.5px] text-text-2">
      {label}
      {value !== undefined ? <b className="font-semibold text-text">{value}</b> : null}
      {onRemove !== undefined ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label} filter`}
          className="grid h-3.5 w-3.5 place-items-center rounded-full text-muted hover:bg-loss-bg hover:text-loss"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </span>
  );
}
