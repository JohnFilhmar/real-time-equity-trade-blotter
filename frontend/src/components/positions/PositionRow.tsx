'use client';

import { memo, type ReactNode } from 'react';
import { unrealised_pnl, type Position } from '@blotter/shared';
import { useMark, useMarkHistory } from '@/hooks/useMarks';
import { format_money, format_price, format_quantity, to_display_notional } from '@/lib/format/money';
import { Sparkline } from './Sparkline';

/** Grid tracks shared by the positions header and rows. */
export const position_grid_cols =
  'grid-cols-[84px_60px_96px_92px_92px_116px_104px_104px_64px_1fr]';

/** Props for {@link PositionRow}. */
export interface PositionRowProps {
  position: Position;
}

/**
 * Formats a signed money amount with a leading sign in the row's semantic colour.
 *
 * @param amount - Amount in the quote currency, or `null` when there is no mark yet.
 * @param currency - The quote currency.
 * @returns A cell.
 */
function Signed({ amount, currency }: { amount: number | null; currency: Position['currency'] }): ReactNode {
  if (amount === null) {
    return <span className="text-faint">{'–'}</span>;
  }
  const display = to_display_notional(amount, currency);
  return (
    <span className={amount >= 0 ? 'text-gain' : 'text-loss'}>
      {amount >= 0 ? '+' : ''}
      {format_money(display, currency)}
    </span>
  );
}

/**
 * One symbol's position: the server's average-cost figures, marked to market with the latest mark
 * from the store. Subscribes to its own symbol's mark only, so a tick re-renders the rows that
 * moved.
 *
 * @param props - The position.
 * @returns A table row.
 */
export const PositionRow = memo(function PositionRow({ position }: PositionRowProps): ReactNode {
  const mark = useMark(position.symbol);
  const history = useMarkHistory(position.symbol);
  const unrealised = unrealised_pnl(position, mark);
  const net_notional = mark === undefined ? null : position.netQuantity * mark;
  const long = position.netQuantity >= 0;
  const tone = (unrealised ?? 0) >= 0 ? 'gain' : 'loss';

  return (
    <tr className={`grid h-11 items-center gap-2.5 border-b border-rule-soft px-3.5 text-[12.5px] ${position_grid_cols}`}>
      <td className="font-semibold">{position.symbol}</td>
      <td className="font-mono text-[10.5px] text-muted">{position.currency}</td>
      <td className={`text-right font-mono tabular-nums ${long ? 'text-gain' : 'text-loss'}`}>
        {long ? '+' : '−'}
        {format_quantity(Math.abs(position.netQuantity))}
      </td>
      <td className="text-right font-mono tabular-nums text-text-2">{position.averagePrice > 0 ? format_price(position.averagePrice) : '–'}</td>
      <td className="text-right font-mono tabular-nums">{mark === undefined ? '–' : format_price(mark)}</td>
      <td className="text-right font-mono tabular-nums"><Signed amount={net_notional} currency={position.currency} /></td>
      <td className="text-right font-mono tabular-nums"><Signed amount={unrealised} currency={position.currency} /></td>
      <td className="text-right font-mono tabular-nums"><Signed amount={position.realisedPnl} currency={position.currency} /></td>
      <td className="text-right font-mono tabular-nums text-text-2">{position.tradeCount.toString()}</td>
      <td className="hidden xl:block">
        <Sparkline values={history} tone={tone} label={`${position.symbol} mark, last ${history.length.toString()} ticks`} />
      </td>
    </tr>
  );
});
