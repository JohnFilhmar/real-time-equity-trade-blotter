'use client';

import type { ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import { useMark } from '@/hooks/useMarks';
import { format_price } from '@/lib/format/money';

/**
 * The price cell: execution price, currency code, and the prototype's tick glyph saying whether
 * the current mark sits above or below it. Subscribes to its own symbol's mark only.
 *
 * @param props - The trade.
 * @returns The cell content.
 */
export function PriceCell({ trade }: { trade: Trade }): ReactNode {
  const mark = useMark(trade.symbol);
  const tick = mark === undefined || mark === trade.price ? null : mark > trade.price ? 'up' : 'down';

  return (
    <span data-cell="price">
      {format_price(trade.price)}
      <span className="ml-1 text-[9.5px] text-text-2">{trade.currency}</span>
      {tick !== null ? (
        <span className={`ml-0.75 inline-block w-2 text-[9px] ${tick === 'up' ? 'text-gain' : 'text-loss'}`} title={`Mark ${tick === 'up' ? 'above' : 'below'} the execution price`} aria-hidden="true">
          {tick === 'up' ? '▲' : '▼'}
        </span>
      ) : null}
    </span>
  );
}
