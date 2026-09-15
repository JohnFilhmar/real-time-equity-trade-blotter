'use client';

import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Note';
import { useConnectionStatus } from '@/hooks/useConnection';
import { useMarks } from '@/hooks/useMarks';
import { usePositions } from '@/hooks/usePositions';
import { PositionRow, position_grid_cols, position_row_classes } from './PositionRow';

/** The screen's column: toolbar, table, note. The positions skeleton is built on the same classes. */
export const positions_screen_classes = 'relative flex min-h-0 flex-1 flex-col';

/** The toolbar row above the table. */
export const positions_toolbar_classes = 'flex shrink-0 flex-wrap items-center gap-2.25 border-b border-rule px-3.5 py-2.5';

/** The scrolling area that holds the table. */
export const positions_scroll_classes = 'min-h-0 flex-1 overflow-auto';

const header_class = 'font-mono text-[9.5px] font-semibold uppercase tracking-[.11em] text-faint';

/** Skeleton rows drawn while the positions load. */
const skeleton_row_count = 8;

/** Each skeleton cell's alignment and placeholder width, column by column, as the header and rows lay them out. */
const skeleton_cells: ReadonlyArray<{ align: string; width: string }> = [
  { align: '', width: 'w-12' },
  { align: '', width: 'w-8' },
  { align: 'text-right', width: 'w-16' },
  { align: 'text-right', width: 'w-14' },
  { align: 'text-right', width: 'w-14' },
  { align: 'text-right', width: 'w-20' },
  { align: 'text-right', width: 'w-16' },
  { align: 'text-right', width: 'w-16' },
  { align: 'text-right', width: 'w-8' },
  { align: 'hidden xl:block', width: 'w-24' },
];

/**
 * The positions table: the sticky column headers over the rows it is given.
 *
 * @param props - The body rows.
 * @returns The table.
 */
function PositionsTable({ children }: { children: ReactNode }): ReactNode {
  return (
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
      <tbody>{children}</tbody>
    </table>
  );
}

/**
 * The table while the positions load: the real column headers over rows on the rows' own classes,
 * so nothing moves when the positions arrive. Hidden from assistive tech, which reads the busy
 * state of the area around it instead.
 *
 * @returns The skeleton table.
 */
export function PositionsTableSkeleton(): ReactNode {
  return (
    <div aria-hidden="true">
      <PositionsTable>
        {Array.from({ length: skeleton_row_count }, (_row, row) => (
          <tr key={row} className={position_row_classes}>
            {skeleton_cells.map((cell, index) => (
              <td key={index} className={cell.align}>
                <Skeleton inline className={`h-2.5 ${cell.width}`} />
              </td>
            ))}
          </tr>
        ))}
      </PositionsTable>
    </div>
  );
}

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
    <div className={positions_screen_classes}>
      <div className={positions_toolbar_classes}>
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

      <div className={positions_scroll_classes} aria-busy={positions.isPending || undefined}>
        {positions.isPending ? (
          <PositionsTableSkeleton />
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
          <PositionsTable>
            {rows.map((row) => (
              <PositionRow key={row.symbol} position={row} />
            ))}
          </PositionsTable>
        )}
      </div>

      <p className="shrink-0 border-t border-rule px-3.5 py-2 font-mono text-[10.5px] text-faint">
        Unrealised is open size times mark minus average cost. Marks are a simulated random walk from each instrument&apos;s reference price, not market data.
      </p>
    </div>
  );
}
