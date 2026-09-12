'use client';

import type { ReactNode } from 'react';
import type { Position } from '@blotter/shared';
import { useConnectionStatus, useLastSeq } from '@/hooks/use_connection';
import { usePositions } from '@/hooks/use_positions';
import { format_money, to_display_notional } from '@/lib/format/money';

/**
 * Sums gross notional across positions in one currency, in its display unit.
 *
 * @param positions - Every position.
 * @param currency - Which currency to sum.
 * @returns Pounds or dollars.
 */
function gross_in(positions: readonly Position[], currency: 'USD' | 'GBX'): number {
  return positions
    .filter((position) => position.currency === currency)
    .reduce((sum, position) => sum + to_display_notional(position.grossNotional, currency), 0);
}

/**
 * One tile.
 *
 * @param props - Label, the big value, and the small line under it.
 * @returns A tile.
 */
function Kpi({ label, value, sub, tone = '' }: { label: string; value: ReactNode; sub: ReactNode; tone?: string }): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-[3px] bg-surface px-4 py-[11px]">
      <div className="truncate font-mono text-[9.5px] uppercase tracking-[.12em] text-faint">{label}</div>
      <div className={`font-mono text-[19px] leading-[1.1] font-semibold tracking-[-.015em] tabular-nums ${tone}`}>{value}</div>
      <div className="truncate font-mono text-[10.5px] text-muted">{sub}</div>
    </div>
  );
}

/**
 * The four tiles under the top bar: active trades, gross notional in each currency, and the feed.
 * Notional, not P&L: a real P&L needs a mark price and a cost-basis convention, both out of scope.
 *
 * @returns The strip.
 */
export function KpiStrip(): ReactNode {
  const positions = usePositions();
  const status = useConnectionStatus();
  const last_seq = useLastSeq();
  const rows = positions.data ?? [];
  const active = rows.reduce((sum, position) => sum + position.tradeCount, 0);
  const symbols = rows.length;
  const dash = '–';

  return (
    <div className="grid shrink-0 grid-cols-2 gap-px border-b border-rule bg-rule-soft md:grid-cols-4">
      <Kpi
        label="Active trades"
        value={positions.data === undefined ? dash : active.toLocaleString('en-GB')}
        sub={`${symbols.toString()} symbols with a position`}
      />
      <Kpi
        label="Gross notional, USD"
        value={positions.data === undefined ? dash : format_money(gross_in(rows, 'USD'), 'USD')}
        sub={`${rows.filter((row) => row.currency === 'USD').length.toString()} US names`}
      />
      <Kpi
        label="Gross notional, GBP"
        value={positions.data === undefined ? dash : format_money(gross_in(rows, 'GBX'), 'GBX')}
        sub={`${rows.filter((row) => row.currency === 'GBX').length.toString()} London names, priced in pence`}
      />
      <Kpi
        label="Feed"
        value={status.toUpperCase()}
        sub={last_seq === null ? 'waiting for the first broadcast' : `last broadcast seq ${last_seq.toString()}`}
        tone={status === 'reconnecting' ? 'text-warn' : 'text-brand'}
      />
    </div>
  );
}
