import { flexRender, type Row } from '@tanstack/react-table';
import { memo, type ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import type { FlashKind } from '@/hooks/use_flash';
import { grid_template_classes, row_height } from './columns';

/** Props for {@link TradeRow}. */
export interface TradeRowProps {
  row: Row<Trade>;
  /** Position in the full list, zero-based. */
  index: number;
  /** Pixel offset from the top of the virtual list. */
  offset: number;
  selected: boolean;
  /** Holds the grid's tab stop. */
  focused: boolean;
  flash: FlashKind | undefined;
  onSelect: (index: number) => void;
  register: (index: number, element: HTMLElement | null) => void;
}

const flash_classes: Record<FlashKind, string> = {
  new: 'animate-flash-new',
  up: 'animate-flash-up',
  down: 'animate-flash-down',
  changed: 'animate-flash-new',
};

/**
 * One trade in the grid. Positioned by the virtualiser, keyed by the trade's id by the caller, and
 * memoised so a broadcast that touches one row re-renders one row.
 *
 * The direction arrow rendered beside the price during a flash is what keeps the flash from
 * carrying direction by hue alone.
 *
 * @param props - The table row, its position, selection and focus state, and its flash.
 * @returns A grid row.
 */
export const TradeRow = memo(function TradeRow({
  row,
  index,
  offset,
  selected,
  focused,
  flash,
  onSelect,
  register,
}: TradeRowProps): ReactNode {
  const trade = row.original;
  const cancelled = trade.status === 'CANCELLED';

  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      ref={(element) => register(index, element)}
      data-trade-id={trade.tradeId}
      data-flash={flash}
      onClick={() => onSelect(index)}
      style={{ transform: `translateY(${offset.toString()}px)`, height: `${row_height.toString()}px` }}
      className={`absolute top-0 left-0 grid w-full cursor-pointer items-center gap-[10px] border-b border-rule-soft px-[14px] text-[12.5px] transition-colors duration-100 hover:bg-brand-hover focus-visible:outline-offset-[-2px] ${grid_template_classes} ${
        selected ? 'bg-brand-bg shadow-[inset_2px_0_0_var(--brand)]' : ''
      } ${cancelled ? 'opacity-40' : ''} ${flash !== undefined ? flash_classes[flash] : ''}`}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = cell.column.columnDef.meta;
        const is_price = cell.column.id === 'price';

        return (
          <div
            key={cell.id}
            role="gridcell"
            className={`min-w-0 truncate ${meta?.numeric ? 'text-right font-mono tabular-nums' : ''} ${meta?.class_name ?? ''} ${
              cancelled && (cell.column.id === 'symbol' || cell.column.id === 'tradeId') ? 'line-through' : ''
            }`}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
            {is_price && (flash === 'up' || flash === 'down') ? (
              <span className={`ml-[3px] inline-block w-2 text-[9px] ${flash === 'up' ? 'text-gain' : 'text-loss'}`} aria-hidden="true">
                {flash === 'up' ? '▲' : '▼'}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
