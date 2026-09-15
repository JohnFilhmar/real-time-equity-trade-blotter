import type { ReactNode } from 'react';

/** Props for {@link NewTradesPill}. */
export interface NewTradesPillProps {
  /** How many trades arrived above the pinned viewport. Renders nothing at zero. */
  count: number;
  onClick: () => void;
}

/**
 * The "3 new trades" pill shown while the viewport is pinned away from the top.
 *
 * @param props - The count and the scroll-to-top handler.
 * @returns A button, or `null` when there is nothing to announce.
 */
export function NewTradesPill({ count, onClick }: NewTradesPillProps): ReactNode {
  if (count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-10 left-1/2 z-[6] -translate-x-1/2 animate-rise rounded-[14px] border border-brand-edge bg-brand-bg px-3 py-1.25 font-mono text-[10.5px] font-semibold tracking-[.06em] text-brand-lo shadow-glass backdrop-blur-md hover:text-brand-hi"
    >
      {'↑'} {count.toString()} new {count === 1 ? 'trade' : 'trades'}
    </button>
  );
}
