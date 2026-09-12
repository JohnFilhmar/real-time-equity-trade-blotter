'use client';

import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Trade, TradeSortColumn } from '@blotter/shared';
import { useFlash } from '@/hooks/use_flash';
import { useRovingRows } from '@/hooks/use_roving_rows';
import { grid_min_width_classes, row_height, trade_columns } from './columns';
import { GridHeader } from './GridHeader';
import { NewTradesPill } from './NewTradesPill';
import { TradeRow } from './TradeRow';

/** Props for {@link TradeGrid}. */
export interface TradeGridProps {
  rows: readonly Trade[];
  /** Server total for the current filters, so assistive tech reads position against the whole set. */
  total: number;
  sort_by: TradeSortColumn;
  sort_dir: 'asc' | 'desc';
  selected_id: string | null;
  onSort: (column: TradeSortColumn) => void;
  onSelect: (trade: Trade | null) => void;
  /** Called when the viewport nears the end of the loaded rows and more exist. */
  onLoadMore: () => void;
  has_more: boolean;
}

/** How many rows from the end the next page is requested. */
const load_more_threshold = 30;

/**
 * The virtualised blotter grid.
 *
 * Rows are keyed by trade id and patched in place by the cache, never wholesale replaced, so
 * scroll position survives every broadcast. At the top the grid follows the feed; scrolled away,
 * the viewport is pinned by compensating the scroll offset for rows inserted above it, and a pill
 * counts what arrived. Keyboard use is row-level with one tab stop. Arrivals are announced to
 * assistive tech as a count, in batches, never row by row.
 *
 * @param props - Rows, total, sort, selection, and the load-more hook.
 * @returns The grid.
 */
export function TradeGrid({
  rows,
  total,
  sort_by,
  sort_dir,
  selected_id,
  onSort,
  onSelect,
  onLoadMore,
  has_more,
}: TradeGridProps): ReactNode {
  // TanStack Table v8 hands back functions the React Compiler cannot memoise without going stale,
  // which is the library's own documented advice for components that call useReactTable.
  'use no memo';

  const scroll_ref = useRef<HTMLDivElement>(null);
  const previous_ids = useRef<readonly string[]>([]);
  const [pending_above, set_pending_above] = useState(0);
  const [announcement, set_announcement] = useState('');
  const arrivals = useRef(0);

  // eslint-disable-next-line react-hooks/incompatible-library -- opted out of the compiler above; the lint still reports the library
  const table = useReactTable({
    data: rows as Trade[],
    columns: trade_columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (trade) => trade.id,
    manualSorting: true,
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll_ref.current,
    estimateSize: () => row_height,
    overscan: 12,
  });

  const roving = useRovingRows(rows.length, {
    on_activate: (index) => onSelect(rows[index] ?? null),
    on_escape: () => onSelect(null),
  });

  const flashes = useFlash(rows);
  const items = virtualizer.getVirtualItems();

  // Scroll pinning: rows inserted above the first visible row shift everything down by one row
  // height each, so the offset is compensated before paint and the viewport stays on the same
  // trades. At the very top nothing is compensated, and the new rows push in.
  useLayoutEffect(() => {
    const previous = previous_ids.current;
    const ids = rows.map((row) => row.id);
    previous_ids.current = ids;

    const element = scroll_ref.current;
    if (element === null || previous.length === 0) {
      return;
    }

    const previous_set = new Set(previous);
    const first_visible = items[0]?.index ?? 0;
    let inserted_above = 0;
    for (let index = 0; index < ids.length && index <= first_visible + inserted_above; index += 1) {
      const id = ids[index];
      if (id !== undefined && !previous_set.has(id)) {
        inserted_above += 1;
      }
    }

    const new_count = ids.filter((id) => !previous_set.has(id)).length;
    arrivals.current += new_count;

    if (inserted_above > 0 && element.scrollTop > 0) {
      element.scrollTop += inserted_above * row_height;
      set_pending_above((count) => count + inserted_above);
    }
  }, [rows, items]);

  // Announce arrivals as a count every two seconds rather than one by one.
  useEffect(() => {
    const timer = setInterval(() => {
      if (arrivals.current > 0) {
        const count = arrivals.current;
        arrivals.current = 0;
        set_announcement(`${count.toString()} new ${count === 1 ? 'trade' : 'trades'} on the blotter`);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const last = items.at(-1);
    if (has_more && last !== undefined && last.index >= rows.length - load_more_threshold) {
      onLoadMore();
    }
  }, [items, rows.length, has_more, onLoadMore]);

  useEffect(() => {
    virtualizer.scrollToIndex(roving.focused_index, { align: 'auto' });
  }, [roving.focused_index, virtualizer]);

  const on_scroll = useCallback(() => {
    if ((scroll_ref.current?.scrollTop ?? 0) === 0) {
      set_pending_above(0);
    }
  }, []);

  const scroll_to_top = useCallback(() => {
    scroll_ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
    set_pending_above(0);
  }, []);

  const select_index = useCallback(
    (index: number) => {
      roving.set_focused_index(index);
      const trade = rows[index];
      onSelect(trade !== undefined && trade.id === selected_id ? null : (trade ?? null));
    },
    [onSelect, roving, rows, selected_id],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <NewTradesPill count={pending_above} onClick={scroll_to_top} />
      <div ref={scroll_ref} onScroll={on_scroll} className="min-h-0 flex-1 overflow-auto">
        <div
          role="grid"
          aria-label="Trade blotter"
          aria-rowcount={total + 1}
          aria-colcount={trade_columns.length}
          aria-multiselectable={false}
          onKeyDown={roving.on_key_down}
          className={grid_min_width_classes}
        >
          <GridHeader table={table} sort_by={sort_by} sort_dir={sort_dir} onSort={onSort} />
          <div role="rowgroup" className="relative w-full" style={{ height: `${virtualizer.getTotalSize().toString()}px` }}>
            {items.map((item) => {
              const table_row = table.getRowModel().rows[item.index];
              if (table_row === undefined) {
                return null;
              }
              return (
                <TradeRow
                  key={table_row.id}
                  row={table_row}
                  index={item.index}
                  offset={item.start}
                  selected={table_row.original.id === selected_id}
                  focused={item.index === roving.focused_index}
                  flash={flashes.get(table_row.original.id)}
                  onSelect={select_index}
                  register={roving.register_row}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}
