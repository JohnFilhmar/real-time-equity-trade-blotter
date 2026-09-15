'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import { SideMark, StatusBadge, VersionPill } from '@/components/ui/Badges';
import { format_clock_or_date } from '@/lib/format/clock';
import { format_notional, format_price, format_quantity } from '@/lib/format/money';
import { trade_cards_id } from '@/lib/grid/gridFocus';

/** Props for {@link TradeCards}. */
export interface TradeCardsProps {
  rows: readonly Trade[];
  selected_id: string | null;
  onSelect: (trade: Trade | null) => void;
  onLoadMore: () => void;
  has_more: boolean;
}

/**
 * The phone layout: one card per trade instead of a grid that would need sideways scrolling.
 * Loads the next page when the sentinel at the bottom scrolls into view. The list carries the id
 * the top bar's skip link looks for, so skipping to the trades focuses the first card.
 *
 * @param props - Rows, selection and the load-more hook.
 * @returns The card list.
 */
export function TradeCards({ rows, selected_id, onSelect, onLoadMore, has_more }: TradeCardsProps): ReactNode {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sentinel.current;
    if (element === null || !has_more) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onLoadMore();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [has_more, onLoadMore]);

  return (
    <div id={trade_cards_id} className="flex flex-col pb-19.5" role="list" aria-label="Trade blotter">
      {rows.map((trade) => {
        const selected = trade.id === selected_id;
        const cancelled = trade.status === 'CANCELLED';
        return (
          <button
            type="button"
            role="listitem"
            key={trade.id}
            data-trade-id={trade.tradeId}
            onClick={() => onSelect(selected ? null : trade)}
            className={`flex min-h-11 w-full flex-col gap-1.75 border-b border-rule-soft px-3.5 py-2.75 text-left active:bg-brand-bg ${
              selected ? 'bg-brand-bg' : ''
            } ${cancelled ? 'opacity-45' : ''}`}
          >
            <div className="flex items-center gap-2">
              <b className="text-[14px] font-semibold">{trade.symbol}</b>
              <SideMark side={trade.side} />
              <span className="ml-auto flex items-center gap-1.25">
                <StatusBadge status={trade.status} />
                <VersionPill version={trade.version} />
              </span>
            </div>
            <div className="flex items-baseline gap-2 font-mono text-[12.5px] tabular-nums">
              <span>{format_quantity(trade.quantity)}</span>
              <span className="text-faint">@</span>
              <span>
                {format_price(trade.price)} <span className="text-[9.5px] text-faint">{trade.currency}</span>
              </span>
              <span className="ml-auto text-text-2">{format_notional(trade.quantity, trade.price, trade.currency)}</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-muted">
              <span className="font-mono text-[10.5px] text-brand">{trade.tradeId}</span>
              <span>{trade.trader}</span>
              <span className="ml-auto font-mono text-[10.5px]">{format_clock_or_date(trade.tradeTimestamp)}</span>
            </div>
          </button>
        );
      })}
      <div ref={sentinel} className="h-px" aria-hidden="true" />
    </div>
  );
}
