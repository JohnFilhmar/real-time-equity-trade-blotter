import { flexRender, type Table } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import type { Trade, TradeSortColumn } from '@blotter/shared';
import { grid_template_classes, sortable_columns } from './columns';

/** Props for {@link GridHeader}. */
export interface GridHeaderProps {
  table: Table<Trade>;
  sort_by: TradeSortColumn;
  sort_dir: 'asc' | 'desc';
  onSort: (column: TradeSortColumn) => void;
}

/**
 * The sticky header row. Each sortable header is a button; the sorted one carries `aria-sort`, the
 * rest carry nothing, which is what the ARIA grid pattern asks for.
 *
 * @param props - The table, the current sort, and the sort handler.
 * @returns The header row.
 */
export function GridHeader({ table, sort_by, sort_dir, onSort }: GridHeaderProps): ReactNode {
  const caret = sort_dir === 'asc' ? '▲' : '▼';

  return (
    <div
      role="row"
      aria-rowindex={1}
      className={`sticky top-0 z-[5] grid h-7.75 items-center gap-2.5 border-b border-rule bg-head px-3.5 backdrop-blur-[10px] ${grid_template_classes}`}
    >
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
                className={`group flex items-center gap-1 whitespace-nowrap font-mono text-[9.5px] font-semibold uppercase tracking-[.11em] transition-colors hover:text-text-2 ${
                  is_sorted ? 'text-brand-lo' : 'text-faint'
                } ${meta?.numeric ? 'ml-auto' : ''}`}
              >
                {label}
                <span className={`transition-opacity ${is_sorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-45'}`} aria-hidden="true">
                  {caret}
                </span>
              </button>
            ) : (
              <span className="whitespace-nowrap font-mono text-[9.5px] font-semibold uppercase tracking-[.11em] text-faint">{label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
