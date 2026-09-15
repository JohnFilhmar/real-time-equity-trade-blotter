'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TradePanel } from '@/components/trade/TradePanel';
import { HistoryRow } from '@/components/trade/TradeHistory';
import { Chip } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Note';
import { useEventFeed } from '@/hooks/usePositions';
import { useTrade } from '@/hooks/useTrades';

/**
 * The global audit trail: every amendment and cancellation on the desk, newest first, paged by
 * keyset. Clicking a line opens the trade it belongs to. Bookings are not events, because the
 * trade row itself records them; they appear in each trade's own history instead.
 *
 * @returns The screen.
 */
export function AuditScreen(): ReactNode {
  const feed = useEventFeed();
  const [openTradeId, setOpenTradeId] = useState<string | null>(null);
  const open_trade = useTrade(openTradeId);
  const sentinel = useRef<HTMLDivElement>(null);

  const amendments = feed.events.filter((event) => event.action === 'AMENDED').length;
  const cancellations = feed.events.filter((event) => event.action === 'CANCELLED').length;
  const actors = new Set(feed.events.map((event) => event.actor)).size;

  useEffect(() => {
    const element = sentinel.current;
    if (element === null || !feed.query.hasNextPage) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !feed.query.isFetchingNextPage) {
        void feed.query.fetchNextPage();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [feed.query]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2.25 border-b border-rule px-3.5 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Events" value={feed.total.toLocaleString('en-GB')} />
          <Chip label="Amendments" value={<span className="text-warn">{amendments.toString()}</span>} />
          <Chip label="Cancellations" value={<span className="text-loss">{cancellations.toString()}</span>} />
          <Chip label="Actors" value={actors.toString()} />
        </div>
        <div className="ml-auto flex items-center gap-2.25">
          <span className="font-mono text-[10.5px] text-muted">
            {feed.events.length.toLocaleString('en-GB')} of {feed.total.toLocaleString('en-GB')} loaded
          </span>
          <Button onClick={() => void feed.query.refetch()} disabled={feed.query.isFetching}>
            {feed.query.isFetching && !feed.query.isPending ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4">
        {feed.query.isPending ? (
          <div className="flex flex-col gap-1.5 py-3.5" aria-busy="true">
            {Array.from({ length: 10 }, (_value, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : feed.query.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center" role="status">
            <p className="m-0 text-[14px] font-semibold">The audit trail could not be loaded</p>
            <p className="m-0 text-[12.5px] text-muted">{feed.query.error.message}</p>
            <Button variant="primary" onClick={() => void feed.query.refetch()}>
              Retry
            </Button>
          </div>
        ) : feed.events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center" role="status">
            <p className="m-0 text-[14px] font-semibold">Nothing has been amended or cancelled yet</p>
            <p className="m-0 max-w-[46ch] text-[12.5px] text-muted">The first amendment or cancellation on the desk appears here, with who did it and what moved.</p>
          </div>
        ) : (
          <div className="py-1">
            {feed.events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setOpenTradeId(event.tradeId)}
                className="block w-full text-left hover:bg-brand-hover"
                aria-label={`Open ${event.tradeId}`}
              >
                <HistoryRow
                  actor={event.actor}
                  action={event.action}
                  changes={event.changes}
                  at={event.occurredAt}
                  source={event.source}
                  version={event.version}
                  trade_id={event.tradeId}
                />
              </button>
            ))}
            <div ref={sentinel} className="h-px" aria-hidden="true" />
            {feed.query.isFetchingNextPage ? <Skeleton className="my-2 h-12 w-full" /> : null}
          </div>
        )}
      </div>

      {open_trade.data !== undefined && openTradeId !== null ? <TradePanel trade={open_trade.data} onClose={() => setOpenTradeId(null)} /> : null}
    </div>
  );
}
