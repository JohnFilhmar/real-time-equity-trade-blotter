'use client';

import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Note';
import { useConnectionStatus } from '@/hooks/useConnection';
import { useMarks } from '@/hooks/useMarks';
import { usePositions } from '@/hooks/usePositions';
import { PositionRow, position_grid_cols } from './PositionRow';

const header_class = 'font-mono text-[9.5px] font-semibold uppercase tracking-[.11em] text-faint';

/**
 * Net positions and P&L by symbol.
 *
 * Average cost and realised P&L are the server's, recomputed and broadcast after every write.
 * Unrealised P&L is this page's: the open size marked against the latest mark from the socket, so
 * it moves with every tick without a request. Marks are a simulated feed, and the page says so.
 *
 * @returns The screen.
 */
export function PositionsScreen(): ReactNode {
  const positions = usePositions();
  const status = useConnectionStatus();
  const marks = useMarks();
  const rows = positions.data ?? [];
  const marks_arrived = Object.keys(marks).length > 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2.25 border-b border-rule px-3.5 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Cost basis" value="average" />
          <Chip label="Marks" value={marks_arrived ? 'simulated, streaming' : 'waiting'} />
          <Chip label="Feed" value={status === 'live' ? 'live' : status} />
        </div>
        <div className="ml-auto flex items-center gap-2.25">
          <span className="font-mono text-[10.5px] text-muted">{rows.length.toString()} symbols</span>
          <Button onClick={() => void positions.refetch()} disabled={positions.isFetching}>
            {positions.isFetching && !positions.isPending ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {positions.isPending ? (
          <div className="flex flex-col gap-1.5 p-3.5" aria-busy="true">
            {Array.from({ length: 8 }, (_value, index) => (
              <Skeleton key={index} className="h-9 w-full" />
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
          <table className="w-full min-w-230 border-collapse">
            <thead>
              <tr className={`sticky top-0 z-[5] grid h-7.75 items-center gap-2.5 border-b border-rule bg-head px-3.5 backdrop-blur-[10px] ${position_grid_cols}`}>
                <th scope="col" className={`text-left ${header_class}`}>Symbol</th>
                <th scope="col" className={`text-left ${header_class}`}>Ccy</th>
                <th scope="col" className={`text-right ${header_class}`}>Net qty</th>
                <th scope="col" className={`text-right ${header_class}`}>Avg price</th>
                <th scope="col" className={`text-right ${header_class}`}>Mark</th>
                <th scope="col" className={`text-right ${header_class}`}>Net notional</th>
                <th scope="col" className={`text-right ${header_class}`}>Unrealised</th>
                <th scope="col" className={`text-right ${header_class}`}>Realised</th>
                <th scope="col" className={`text-right ${header_class}`}>Trades</th>
                <th scope="col" className={`hidden text-left xl:block ${header_class}`}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <PositionRow key={row.symbol} position={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="shrink-0 border-t border-rule px-3.5 py-2 font-mono text-[10.5px] text-faint">
        Unrealised is open size times mark minus average cost. Marks are a simulated random walk from each instrument&apos;s reference price, not market data.
      </p>
    </div>
  );
}
