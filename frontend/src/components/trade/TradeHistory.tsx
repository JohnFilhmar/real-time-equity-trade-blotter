'use client';

import type { ReactNode } from 'react';
import type { Trade, TradeEvent } from '@blotter/shared';
import { Skeleton } from '@/components/ui/Note';
import { useTradeEvents } from '@/hooks/use_trades';
import { format_clock } from '@/lib/format/clock';

const dot_colour: Record<TradeEvent['action'] | 'BOOKED', string> = {
  BOOKED: 'bg-brand',
  AMENDED: 'bg-warn',
  CANCELLED: 'bg-loss',
};

const verb: Record<TradeEvent['action'] | 'BOOKED', string> = {
  BOOKED: 'booked',
  AMENDED: 'amended',
  CANCELLED: 'cancelled',
};

/**
 * One line of history: who did what, the fields that moved, and when.
 *
 * @param props - The actor, the action, the changes, the time, the source and the version.
 * @returns A row.
 */
export function HistoryRow({
  actor,
  action,
  changes,
  at,
  source,
  version,
  trade_id,
}: {
  actor: string;
  action: TradeEvent['action'] | 'BOOKED';
  changes: TradeEvent['changes'];
  at: string;
  source: string;
  version: number;
  trade_id?: string;
}): ReactNode {
  const deltas = Object.entries(changes).filter(([field]) => field !== 'status');

  return (
    <div className="flex gap-[10px] border-b border-rule-soft py-[10px] last:border-b-0">
      <div className={`mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full ${dot_colour[action]}`} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="text-[12px] text-text-2">
          <b className="font-semibold text-text">{actor}</b> {verb[action]}
          {trade_id !== undefined ? <span className="ml-[6px] font-mono text-brand">{trade_id}</span> : null}
        </div>
        {deltas.length > 0 ? (
          <div className="mt-[2px] flex flex-wrap gap-x-[9px] gap-y-1 font-mono text-[11px]">
            {deltas.map(([field, change]) => (
              <span key={field}>
                <span className="text-muted">{field}</span> <s className="text-loss opacity-75">{String(change.from)}</s>{' '}
                <i className="not-italic text-gain">{String(change.to)}</i>
              </span>
            ))}
          </div>
        ) : null}
        <div className="font-mono text-[10.5px] text-faint">
          {format_clock(at)} {'·'} {source} {'·'} v{version}
        </div>
      </div>
    </div>
  );
}

/**
 * The history of one trade, booking first, then every amendment and the cancellation.
 *
 * Booking is not an event on the server, because the row itself records it, so the first line is
 * synthesised from the trade's own timestamps and the rest come from the audit trail.
 *
 * @param props - The trade.
 * @returns The list.
 */
export function TradeHistory({ trade }: { trade: Trade }): ReactNode {
  const events = useTradeEvents(trade.tradeId);

  return (
    <div className="flex flex-col">
      <HistoryRow actor={trade.trader} action="BOOKED" changes={{}} at={trade.createdAt} source="booking" version={1} />
      {events.isPending ? <Skeleton className="mt-2 h-[38px] w-full" /> : null}
      {events.isError ? <div className="font-mono text-[10.5px] text-loss">History could not be loaded.</div> : null}
      {events.data?.map((event) => (
        <HistoryRow
          key={event.id}
          actor={event.actor}
          action={event.action}
          changes={event.changes}
          at={event.occurredAt}
          source={event.source}
          version={event.version}
        />
      ))}
    </div>
  );
}
