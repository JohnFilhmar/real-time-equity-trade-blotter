'use client';

import { useState, type ReactNode } from 'react';
import { Chip } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Note';
import { useConnectionStatus } from '@/hooks/use_connection';
import { usePositions } from '@/hooks/use_positions';
import { format_money, format_quantity, to_display_notional } from '@/lib/format/money';
import { TradePanel } from '@/components/trade/TradePanel';
import { useTrade } from '@/hooks/use_trades';

const header_class = 'font-mono text-[9.5px] font-semibold uppercase tracking-[.11em] text-faint';
const grid_cols = 'grid-cols-[84px_60px_96px_92px_92px_124px_72px_1fr]';

/**
 * Net positions by symbol. Every figure is derived from the active trades on the server; nothing
 * here is a P&L, and the page says so, because a P&L needs a mark price and a cost-basis
 * convention that the brief does not supply.
 *
 * @returns The screen.
 */
export function PositionsScreen(): ReactNode {
  const positions = usePositions();
  const status = useConnectionStatus();
  const [open_trade_id, set_open_trade_id] = useState<string | null>(null);
  const open_trade = useTrade(open_trade_id);
  const rows = positions.data ?? [];
  const max_gross = Math.max(1, ...rows.map((row) => to_display_notional(row.grossNotional, row.currency)));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-[9px] border-b border-rule px-[14px] py-[10px]">
        <div className="flex flex-wrap gap-[6px]">
          <Chip label="Basis" value="active trades" />
          <Chip label="Figures" value="notional, not P&L" />
          <Chip label="Feed" value={status === 'live' ? 'live' : status} />
        </div>
        <div className="ml-auto flex items-center gap-[9px]">
          <span className="font-mono text-[10.5px] text-muted">{rows.length.toString()} symbols</span>
          <Button onClick={() => void positions.refetch()} disabled={positions.isFetching}>
            {positions.isFetching && !positions.isPending ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {positions.isPending ? (
          <div className="flex flex-col gap-[6px] p-[14px]" aria-busy="true">
            {Array.from({ length: 8 }, (_value, index) => (
              <Skeleton key={index} className="h-[36px] w-full" />
            ))}
          </div>
        ) : positions.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status">
            <p className="m-0 text-[14px] font-semibold">Positions could not be loaded</p>
            <p className="m-0 text-[12.5px] text-muted">{positions.error.message}</p>
            <Button variant="primary" onClick={() => void positions.refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status">
            <p className="m-0 text-[14px] font-semibold">No open positions</p>
            <p className="m-0 max-w-[46ch] text-[12.5px] text-muted">Every trade on the blotter is cancelled, or there are none yet. A position appears the moment an active trade exists.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className={`sticky top-0 z-[5] grid h-[31px] items-center gap-[10px] border-b border-rule bg-head px-[14px] backdrop-blur-[10px] ${grid_cols}`}>
                <th scope="col" className={`text-left ${header_class}`}>Symbol</th>
                <th scope="col" className={`text-left ${header_class}`}>Ccy</th>
                <th scope="col" className={`text-right ${header_class}`}>Net qty</th>
                <th scope="col" className={`text-right ${header_class}`}>Bought</th>
                <th scope="col" className={`text-right ${header_class}`}>Sold</th>
                <th scope="col" className={`text-right ${header_class}`}>Gross notional</th>
                <th scope="col" className={`text-right ${header_class}`}>Trades</th>
                <th scope="col" className={`text-left ${header_class}`}>Share of gross</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const gross = to_display_notional(row.grossNotional, row.currency);
                const long = row.netQuantity >= 0;
                return (
                  <tr key={row.symbol} className={`grid h-[44px] items-center gap-[10px] border-b border-rule-soft px-[14px] text-[12.5px] ${grid_cols}`}>
                    <td className="font-semibold">{row.symbol}</td>
                    <td className="font-mono text-[10.5px] text-muted">{row.currency}</td>
                    <td className={`text-right font-mono tabular-nums ${long ? 'text-gain' : 'text-loss'}`}>
                      {long ? '+' : '−'}
                      {format_quantity(Math.abs(row.netQuantity))}
                    </td>
                    <td className="text-right font-mono tabular-nums text-text-2">{format_quantity(row.buyQuantity)}</td>
                    <td className="text-right font-mono tabular-nums text-text-2">{format_quantity(row.sellQuantity)}</td>
                    <td className="text-right font-mono tabular-nums">{format_money(gross, row.currency)}</td>
                    <td className="text-right font-mono tabular-nums text-text-2">{row.tradeCount.toString()}</td>
                    <td>
                      <div className="h-[5px] min-w-[60px] overflow-hidden rounded-[3px] bg-sunk" aria-label={`${((gross / max_gross) * 100).toFixed(0)} percent of the largest position`}>
                        <div className={`h-full rounded-[3px] opacity-55 ${long ? 'bg-gain' : 'bg-loss'}`} style={{ width: `${Math.max(4, (gross / max_gross) * 100).toString()}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open_trade.data !== undefined && open_trade_id !== null ? <TradePanel trade={open_trade.data} onClose={() => set_open_trade_id(null)} /> : null}
    </div>
  );
}
