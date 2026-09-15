'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Note';
import { grid_min_width_classes, row_height, sortable_columns, trade_columns } from './columns';
import { grid_header_label_classes, grid_header_row_classes } from './GridHeader';
import { trade_card_classes, trade_card_line_classes } from './TradeCards';
import { trade_row_classes } from './TradeRow';

/** Rows drawn under the header: enough to fill a tall screen. */
const row_count = 24;

/** Cards drawn on a phone. */
const card_count = 8;

/** Placeholder width per column, each narrower than the column's narrowest track. */
const cell_widths: Readonly<Record<string, string>> = {
  tradeId: 'w-18',
  symbol: 'w-11',
  side: 'w-8',
  quantity: 'w-13',
  price: 'w-16',
  notional: 'w-19',
  trader: 'w-14',
  book: 'w-19',
  counterparty: 'w-24',
  tradeTimestamp: 'w-15',
  status: 'w-14',
};

/**
 * The classes a header or body cell takes from its column: right alignment for figures, and the
 * breakpoint that shows it.
 *
 * @param column - The column definition.
 * @returns The cell's classes.
 */
function cell_classes(column: (typeof trade_columns)[number]): string {
  return `min-w-0 ${column.meta?.numeric ? 'text-right' : ''} ${column.meta?.class_name ?? ''}`;
}

/**
 * The grid from `md` up: the real header labels, then rows of the grid's own height, on the grid's
 * tracks, with each column shown at the same breakpoints as the real one.
 *
 * @returns The grid skeleton.
 */
function GridSkeleton(): ReactNode {
  return (
    <div className="hidden min-h-0 flex-1 flex-col md:flex">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={grid_min_width_classes}>
          <div className={grid_header_row_classes}>
            {trade_columns.map((column, index) => (
              <div key={column.id ?? index} className={cell_classes(column)}>
                <span className={`inline-flex items-center gap-1 ${grid_header_label_classes} text-faint`}>
                  {typeof column.header === 'string' ? column.header : null}
                  {sortable_columns.has(column.id ?? '') ? <span className="opacity-0">▼</span> : null}
                </span>
              </div>
            ))}
          </div>
          {Array.from({ length: row_count }, (_row, row) => (
            <div key={row} className={trade_row_classes} style={{ height: `${row_height.toString()}px` }}>
              {trade_columns.map((column, index) => (
                <div key={column.id ?? index} className={cell_classes(column)}>
                  <Skeleton inline className={`h-2.5 ${cell_widths[column.id ?? ''] ?? 'w-12'}`} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One phone card: the symbol line, the size and price line, and the id and time line, each on the
 * card's own type sizes so the card is as tall as a real one.
 *
 * @returns The card skeleton.
 */
function CardSkeleton(): ReactNode {
  return (
    <div className={trade_card_classes}>
      <div className={trade_card_line_classes.head}>
        <span className="text-[14px]">
          <Skeleton inline className="h-3 w-12" />
        </span>
        <span className="text-[10.5px]">
          <Skeleton inline className="h-2 w-8" />
        </span>
        <span className="ml-auto text-[9.5px]">
          <Skeleton inline shape="pill" className="h-3 w-14" />
        </span>
      </div>
      <div className={trade_card_line_classes.figures}>
        <span>
          <Skeleton inline className="h-2.5 w-24" />
        </span>
        <span className="ml-auto">
          <Skeleton inline className="h-2.5 w-16" />
        </span>
      </div>
      <div className={trade_card_line_classes.meta}>
        <span className="text-[10.5px]">
          <Skeleton inline className="h-2 w-18" />
        </span>
        <span>
          <Skeleton inline className="h-2 w-12" />
        </span>
        <span className="ml-auto text-[10.5px]">
          <Skeleton inline className="h-2 w-15" />
        </span>
      </div>
    </div>
  );
}

/**
 * The rows while the trades load, in the grid's place: the grid from `md` and cards below it.
 * Breakpoints come from Tailwind classes rather than a media query hook, so the first paint is
 * right at every width. The header, row and card boxes use the classes the real grid and cards
 * export, so a change to either reaches the skeleton too.
 *
 * @returns The skeleton rows.
 */
export function BlotterRowsSkeleton(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading trades">
      <GridSkeleton />
      <div className="min-h-0 flex-1 overflow-hidden md:hidden">
        <div className="flex flex-col">
          {Array.from({ length: card_count }, (_card, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
