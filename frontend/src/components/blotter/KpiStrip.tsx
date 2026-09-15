'use client';

import type { ReactNode } from 'react';
import { unrealised_pnl, type Currency, type MarkSet, type Position } from '@blotter/shared';
import { Skeleton } from '@/components/ui/Note';
import { useConnectionStatus, useLastSeq } from '@/hooks/useConnection';
import { useMarks } from '@/hooks/useMarks';
import { usePositions } from '@/hooks/usePositions';
import { format_money, to_display_notional } from '@/lib/format/money';

/** The strip: two tiles a row on a phone, four from `md`, divided by hairlines. */
const strip_classes = 'grid shrink-0 grid-cols-2 gap-px border-b border-rule bg-rule-soft md:grid-cols-4';

/** One tile. */
const tile_classes = 'flex min-w-0 flex-col gap-0.75 bg-surface px-4 py-2.75';

/** A tile's label line. */
const label_classes = 'truncate font-mono text-[9.5px] uppercase tracking-[.12em] text-faint';

/** The value line of a money tile: dollars, then pounds. */
const money_value_classes = 'flex items-baseline gap-3 font-mono text-[17px] leading-[1.1] font-semibold tracking-[-.015em] tabular-nums';

/** The value line of a count tile, a step larger than the money tiles. */
const count_value_classes = 'font-mono text-[19px] leading-[1.1] font-semibold tracking-[-.015em] tabular-nums';

/** A tile's detail line. */
const sub_classes = 'truncate font-mono text-[10.5px] text-muted';

/** Each tile's value line in strip order, so a skeleton tile is exactly as tall as the tile it stands for. */
const tile_value_classes = [money_value_classes, money_value_classes, count_value_classes, count_value_classes];

/** Per-currency totals the strip shows. */
interface Totals {
  net_notional: number | null;
  pnl: number | null;
  unrealised: number | null;
  realised: number;
}

/**
 * Sums one currency's positions, marked to market.
 *
 * @param positions - Every position.
 * @param marks - The current marks.
 * @param currency - Which currency to sum.
 * @returns Totals in the display unit, or `null` where a mark is missing.
 */
function totals_in(positions: readonly Position[], marks: MarkSet, currency: Currency): Totals {
  const rows = positions.filter((position) => position.currency === currency);
  let net_notional = 0;
  let unrealised = 0;
  let realised = 0;
  let marked = true;

  for (const row of rows) {
    const mark = marks[row.symbol];
    const open = unrealised_pnl(row, mark);
    if (mark === undefined || open === null) {
      marked = false;
    } else {
      net_notional += row.netQuantity * mark;
      unrealised += open;
    }
    realised += row.realisedPnl;
  }

  return {
    net_notional: marked ? to_display_notional(net_notional, currency) : null,
    unrealised: marked ? to_display_notional(unrealised, currency) : null,
    pnl: marked ? to_display_notional(unrealised + realised, currency) : null,
    realised: to_display_notional(realised, currency),
  };
}

/**
 * A signed amount, or a dash while no mark has arrived.
 *
 * @param amount - Display-currency amount, or `null`.
 * @param currency - The quote currency, for the symbol.
 * @returns Text.
 */
function signed(amount: number | null, currency: Currency): string {
  if (amount === null) {
    return '–';
  }
  return `${amount >= 0 ? '+' : ''}${format_money(amount, currency)}`;
}

/**
 * One tile with a USD line and a GBP line.
 *
 * @param props - Label and the two values.
 * @returns A tile.
 */
function MoneyKpi({ label, usd, gbp, sub }: { label: string; usd: number | null; gbp: number | null; sub: ReactNode }): ReactNode {
  const tone = (value: number | null): string => (value === null ? 'text-faint' : value >= 0 ? 'text-gain' : 'text-loss');
  return (
    <div className={tile_classes}>
      <div className={label_classes}>{label}</div>
      <div className={money_value_classes}>
        <span className={tone(usd)}>{signed(usd, 'USD')}</span>
        <span className={`text-[13px] ${tone(gbp)}`}>{signed(gbp, 'GBX')}</span>
      </div>
      <div className={sub_classes}>{sub}</div>
    </div>
  );
}

/**
 * The strip while there are no positions to show yet: each tile's three lines on the real lines'
 * classes, so the strip is the same height before and after the numbers land.
 *
 * @returns Four skeleton tiles.
 */
function KpiStripSkeleton(): ReactNode {
  return (
    <div className={strip_classes} aria-busy="true">
      {tile_value_classes.map((value_classes, index) => (
        <div key={index} className={tile_classes}>
          <div className={label_classes}>
            <Skeleton inline className="h-2 w-18" />
          </div>
          <div className={value_classes}>
            <span>
              <Skeleton inline className="h-3 w-28" />
            </span>
          </div>
          <div className={sub_classes}>
            <Skeleton inline className="h-2 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The four tiles under the top bar, the prototype's KPI strip: net position, P&L, active trades
 * and the feed. Money tiles show dollars then pounds, because the universe quotes in both and
 * summing them would invent a rate. While the session restores or the positions load, the tiles
 * are skeletons of the same size.
 *
 * @returns The strip.
 */
export function KpiStrip(): ReactNode {
  const positions = usePositions();
  const marks = useMarks();
  const status = useConnectionStatus();
  const last_seq = useLastSeq();

  if (positions.isPending) {
    return <KpiStripSkeleton />;
  }

  const rows = positions.data ?? [];
  const usd = totals_in(rows, marks, 'USD');
  const gbp = totals_in(rows, marks, 'GBX');
  const active = rows.reduce((sum, position) => sum + position.tradeCount, 0);

  return (
    <div className={strip_classes}>
      <MoneyKpi label="Net position" usd={usd.net_notional} gbp={gbp.net_notional} sub={`${rows.length.toString()} symbols, marked to the simulated feed`} />
      <MoneyKpi
        label="P&L"
        usd={usd.pnl}
        gbp={gbp.pnl}
        sub={`unrl ${signed(usd.unrealised, 'USD')} · rlsd ${signed(usd.realised, 'USD')}`}
      />
      <div className={tile_classes}>
        <div className={label_classes}>Active trades</div>
        <div className={count_value_classes}>{positions.data === undefined ? '–' : active.toLocaleString('en-GB')}</div>
        <div className={sub_classes}>{rows.filter((row) => row.currency === 'USD').length.toString()} US names, {rows.filter((row) => row.currency === 'GBX').length.toString()} London names</div>
      </div>
      <div className={tile_classes}>
        <div className={label_classes}>Feed</div>
        <div className={`${count_value_classes} ${status === 'reconnecting' ? 'text-warn' : 'text-brand'}`}>{status.toUpperCase()}</div>
        <div className={sub_classes}>{last_seq === null ? 'waiting for the first broadcast' : `last broadcast seq ${last_seq.toString()}`}</div>
      </div>
    </div>
  );
}
