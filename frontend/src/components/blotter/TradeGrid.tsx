'use client';

import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Trade, TradeSortColumn } from '@blotter/shared';
import { useFlash } from '@/hooks/useFlash';
import { useRovingRows } from '@/hooks/useRovingRows';
import { register_grid_focus, trade_grid_id } from '@/lib/grid/gridFocus';
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
  /**
   * Names the list the rows belong to, or `null` while rows from the previous view stand in as a
   * placeholder. Rows first seen under a new key are neither flashed nor counted as arrivals.
   */
  view_key: string | null;
  /** Rows for a new sort or filter are loading: the rows dim but stay usable, and the grid is busy. */
  pending: boolean;
  onSort: (column: TradeSortColumn) => void;
  /** Called with the trade the detail panel should show, or `null` to close it. */
  onSelect: (trade: Trade | null) => void;
  /** Called when the viewport nears the end of the loaded rows and more exist. */
  onLoadMore: () => void;
  has_more: boolean;
}

/** How many rows from the end the next page is requested. */
const load_more_threshold = 30;

/** Rows rendered beyond each edge of the viewport. */
const overscan = 12;

/**
 * The virtualised blotter grid.
 *
 * Rows are keyed by trade id and patched in place by the cache, never wholesale replaced, so
 * scroll position survives every broadcast. At the top the grid follows the feed; scrolled away,
 * the viewport is pinned by compensating the scroll offset for rows inserted above it, and a pill
 * counts what arrived. Arrivals are announced to assistive tech as a count, in batches, never row
 * by row, and the rows of a new sort or filter are not arrivals.
 *
 * Keyboard use is row-level with one tab stop, held by trade id. The tab-stop row stays rendered
 * wherever the viewport is, so scrolling never drops focus. With the detail panel open, moving
 * between rows moves the panel with them; focus stays in the grid until Tab takes it into the panel.
 *
 * @param props - Rows, total, sort, selection, loading state, and the load-more hook.
 * @returns The grid.
 */
export function TradeGrid({
  rows,
  total,
  sort_by,
  sort_dir,
  selected_id,
  view_key,
  pending,
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
  const previous_view = useRef<string | null>(view_key);
  const [pendingAbove, setPendingAbove] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const arrivals = useRef(0);

  // eslint-disable-next-line react-hooks/incompatible-library -- opted out of the compiler above; the lint still reports the library
  const table = useReactTable({
    data: rows as Trade[],
    columns: trade_columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (trade) => trade.id,
    manualSorting: true,
  });

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const trade_by_id = (id: string): Trade | null => rows.find((row) => row.id === id) ?? null;

  const roving = useRovingRows(ids, {
    on_move: (id) => {
      if (selected_id !== null) {
        onSelect(trade_by_id(id));
      }
    },
    on_activate: (id) => onSelect(trade_by_id(id)),
    on_escape: () => onSelect(null),
    scroll_to_index: (index) => virtualizer.scrollToIndex(index, { align: 'auto' }),
  });

  const { focused_index, focused_id, focus_current, set_focused_id } = roving;

  const range_extractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (focused_index < 0 || focused_index >= range.count || indexes.includes(focused_index)) {
        return indexes;
      }
      return [...indexes, focused_index].sort((a, b) => a - b);
    },
    [focused_index],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll_ref.current,
    estimateSize: () => row_height,
    overscan,
    rangeExtractor: range_extractor,
  });

  const flashes = useFlash(rows, view_key);
  const items = virtualizer.getVirtualItems();

  // Scroll pinning: rows inserted above the first visible row shift everything down by one row
  // height each, so the offset is compensated before paint and the viewport stays on the same
  // trades. At the very top nothing is compensated, and the new rows push in.
  useLayoutEffect(() => {
    const previous = previous_ids.current;
    const same_view = view_key !== null && view_key === previous_view.current;
    previous_ids.current = ids;
    if (view_key !== null) {
      previous_view.current = view_key;
    }

    const element = scroll_ref.current;
    if (element === null || previous.length === 0 || !same_view) {
      return;
    }

    const previous_set = new Set(previous);
    // Rows are one fixed height, so the first row under the sticky header follows from the offset.
    // The rendered items cannot say, because the tab-stop row renders wherever it sits.
    const first_visible = Math.floor(element.scrollTop / row_height);
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
      setPendingAbove((count) => count + inserted_above);
    }
  }, [ids, view_key]);

  // Announce arrivals as a count every two seconds rather than one by one.
  useEffect(() => {
    const timer = setInterval(() => {
      if (arrivals.current > 0) {
        const count = arrivals.current;
        arrivals.current = 0;
        setAnnouncement(`${count.toString()} new ${count === 1 ? 'trade' : 'trades'} on the blotter`);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const last = items.filter((item) => item.index !== focused_index).at(-1) ?? items.at(-1);
    if (has_more && last !== undefined && last.index >= rows.length - load_more_threshold) {
      onLoadMore();
    }
  }, [items, focused_index, rows.length, has_more, onLoadMore]);

  useEffect(() => register_grid_focus(focus_current), [focus_current]);

  const on_scroll = useCallback(() => {
    if ((scroll_ref.current?.scrollTop ?? 0) === 0) {
      setPendingAbove(0);
    }
  }, []);

  const scroll_to_top = useCallback(() => {
    scroll_ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setPendingAbove(0);
  }, []);

  const select_row = useCallback(
    (id: string) => {
      set_focused_id(id);
      const trade = rows.find((row) => row.id === id) ?? null;
      onSelect(trade !== null && trade.id === selected_id ? null : trade);
    },
    [onSelect, rows, selected_id, set_focused_id],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <NewTradesPill count={pendingAbove} onClick={scroll_to_top} />
      <div ref={scroll_ref} onScroll={on_scroll} className="min-h-0 flex-1 overflow-auto">
        <div
          id={trade_grid_id}
          role="grid"
          aria-label="Trade blotter"
          aria-rowcount={total + 1}
          aria-colcount={trade_columns.length}
          aria-multiselectable={false}
          aria-busy={pending || undefined}
          onKeyDown={roving.on_key_down}
          onFocus={roving.on_focus}
          onBlur={roving.on_blur}
          className={grid_min_width_classes}
        >
          <GridHeader table={table} sort_by={sort_by} sort_dir={sort_dir} pending={pending} onSort={onSort} />
          <div
            role="rowgroup"
            className={`relative w-full transition-opacity duration-150 ${pending ? 'opacity-55' : ''}`}
            style={{ height: `${virtualizer.getTotalSize().toString()}px` }}
          >
            {items.map((item) => {
              const table_row = table.getRowModel().rows[item.index];
              if (table_row === undefined) {
                return null;
              }
              const id = table_row.original.id;
              return (
                <TradeRow
                  key={table_row.id}
                  row={table_row}
                  index={item.index}
                  offset={item.start}
                  selected={id === selected_id}
                  focused={id === focused_id}
                  inserted={flashes.inserted.has(id)}
                  cell_flashes={flashes.cells.get(id)}
                  onSelect={select_row}
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
