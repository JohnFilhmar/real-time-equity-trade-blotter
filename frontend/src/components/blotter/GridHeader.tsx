import { flexRender, type Table } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import type { Trade, TradeSortColumn } from '@blotter/shared';
import { grid_template_classes, sortable_columns } from './columns';

/** The header row's box on the grid's tracks, without its sticky placement. The loading skeleton draws its header with it. */
export const grid_header_row_classes = `grid h-7.75 items-center gap-2.5 border-b border-rule bg-head px-3.5 ${grid_template_classes}`;

/** How a header label is set, without its colour. The loading skeleton sets its labels with it. */
export const grid_header_label_classes = 'whitespace-nowrap font-mono text-[9.5px] font-semibold uppercase tracking-[.11em]';

/** Props for {@link GridHeader}. */
export interface GridHeaderProps {
  table: Table<Trade>;
  /** The sort to show, which already reflects a click whose URL write has not landed. */
  sort_by: TradeSortColumn;
  sort_dir: 'asc' | 'desc';
  /** Rows for a new sort or filter are loading, so a thin bar runs along the bottom edge. */
  pending: boolean;
  onSort: (column: TradeSortColumn) => void;
}

/**
 * The sticky header row. Each sortable header is a button; the sorted one carries `aria-sort`, the
 * rest carry nothing, which is what the ARIA grid pattern asks for.
 *
 * While rows for a new view load, a 2px bar slides along the header's bottom edge, and holds still
 * when the user has turned motion off. It is hidden from assistive tech, which reads `aria-busy` on
 * the grid instead.
 *
 * @param props - The table, the sort to show, whether rows are loading, and the sort handler.
 * @returns The header row.
 */
export function GridHeader({ table, sort_by, sort_dir, pending, onSort }: GridHeaderProps): ReactNode {
  const caret = sort_dir === 'asc' ? '▲' : '▼';

  return (
    <div role="row" aria-rowindex={1} className={`sticky top-0 z-[5] ${grid_header_row_classes} backdrop-blur-[10px]`}>
      {table.getFlatHeaders().map((header) => {
        const meta = header.column.columnDef.meta;
        const column_id = header.column.id;
        const sortable = sortable_columns.has(column_id);
        const is_sorted = sortable && column_id === sort_by;
        const label = flexRender(header.column.columnDef.header, header.getContext());

        return (
          <div
            key={header.id}
            role="columnheader"
            aria-sort={is_sorted ? (sort_dir === 'asc' ? 'ascending' : 'descending') : undefined}
            className={`min-w-0 ${meta?.numeric ? 'text-right' : ''} ${meta?.class_name ?? ''}`}
          >
            {sortable ? (
              <button
                type="button"
                onClick={() => onSort(column_id as TradeSortColumn)}
                data-on={is_sorted ? '1' : '0'}
                className={`group flex items-center gap-1 ${grid_header_label_classes} transition-colors hover:text-text-2 ${
                  is_sorted ? 'text-brand-lo' : 'text-faint'
                } ${meta?.numeric ? 'ml-auto' : ''}`}
              >
                {label}
                <span className={`transition-opacity ${is_sorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-45'}`} aria-hidden="true">
                  {caret}
                </span>
              </button>
            ) : (
              <span className={`${grid_header_label_classes} text-faint`}>{label}</span>
            )}
          </div>
        );
      })}
      {pending ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-progress bg-linear-to-r from-transparent via-brand to-transparent motion-reduce:w-full motion-reduce:animate-none" />
        </div>
      ) : null}
    </div>
  );
}
