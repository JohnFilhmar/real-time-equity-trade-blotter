import type { ReactNode } from 'react';

/**
 * The blotter's mark: a rounded square in the brand gradient carrying the trend line.
 *
 * Decorative, so hidden from assistive tech; the wordmark beside it carries the name.
 *
 * @returns The mark, 24px square.
 */
export function BrandMark(): ReactNode {
  return (
    <div
      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-linear-145 from-brand-grad-hi to-brand-grad-lo text-brand-lo shadow-[inset_0_0_0_1px_var(--brand_edge)]"
      aria-hidden="true"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
      </svg>
    </div>
  );
}
