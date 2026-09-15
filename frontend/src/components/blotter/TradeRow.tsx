import { flexRender, type Row } from '@tanstack/react-table';
import { memo, type ReactNode } from 'react';
import type { Trade } from '@blotter/shared';
import type { CellFlashKind, RowCellFlashes } from '@/lib/grid/flash';
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
  /** Arrived since the list's baseline, so the whole row shows the insert flash. */
  inserted: boolean;
  /** The cells an amendment changed, keyed by column id, or `undefined` when none is flashing. */
  cell_flashes: RowCellFlashes | undefined;
  /** Called with the trade's row id when the row is clicked. */
  onSelect: (id: string) => void;
  /** Registers the row element under the trade's row id, for keyboard focus. */
  register: (id: string, element: HTMLElement | null) => void;
}

/**
 * Tint animation per movement, with a still tint in its place when the user has turned motion off.
 * The negative margins and matching padding grow the tint to nearly the row's height without moving
 * the cell's content. For as long as a neutral flash is attached, everything in the cell takes the
 * primary text colour, which keeps 4.5:1 over a tint as strong as the up and down ones.
 */
const cell_flash_classes: Record<CellFlashKind, string> = {
  up: 'animate-flash-up motion-reduce:animate-flash-hold-up',
  down: 'animate-flash-down motion-reduce:animate-flash-hold-down',
  changed: 'animate-flash-changed motion-reduce:animate-flash-hold-changed text-text **:text-text',
};

/**
 * One trade in the grid. Positioned by the virtualiser, keyed by the trade's id by the caller, and
 * memoised so a broadcast that touches one row re-renders one row.
 *
 * A new row flashes as a whole. An amendment flashes only the cells it changed, and each numeric
 * cell shows a direction arrow for the length of its flash, which keeps the flash from carrying
 * direction by hue alone. A flashing cell is keyed by the version that set it off, so the next
 * amendment remounts it and the animation starts again.
 *
 * @param props - The table row, its position, selection and focus state, and its flashes.
 * @returns A grid row.
 */
export const TradeRow = memo(function TradeRow({
  row,
  index,
  offset,
  selected,
  focused,
  inserted,
  cell_flashes,
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
      ref={(element) => register(trade.id, element)}
      data-trade-id={trade.tradeId}
      data-flash={inserted ? 'new' : undefined}
      onClick={() => onSelect(trade.id)}
      style={{ transform: `translateY(${offset.toString()}px)`, height: `${row_height.toString()}px` }}
      className={`absolute top-0 left-0 grid w-full cursor-pointer items-center gap-2.5 border-b border-rule-soft px-3.5 text-[12.5px] transition-colors duration-100 hover:bg-brand-hover focus-visible:rounded-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-lo ${grid_template_classes} ${
        selected ? 'bg-brand-bg shadow-[inset_2px_0_0_var(--brand)]' : ''
      } ${cancelled ? 'opacity-40' : ''} ${inserted ? 'animate-flash-new' : ''}`}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = cell.column.columnDef.meta;
        const flash = cell_flashes?.get(cell.column.id);

        return (
          <div
            key={flash === undefined ? cell.id : `${cell.id}:v${flash.version.toString()}`}
            role="gridcell"
            data-cell-flash={flash?.kind}
            className={`min-w-0 truncate ${meta?.numeric ? 'text-right font-mono tabular-nums' : ''} ${meta?.class_name ?? ''} ${
              flash === undefined ? '' : `-mx-1.25 -my-1.5 rounded-sm px-1.25 py-1.5 ${cell_flash_classes[flash.kind]}`
            } ${cancelled && (cell.column.id === 'symbol' || cell.column.id === 'tradeId') ? 'line-through' : ''}`}
          >
            {flash !== undefined && flash.kind !== 'changed' ? (
              <span className={`mr-0.75 inline-block w-2 text-[9px] ${flash.kind === 'up' ? 'text-gain' : 'text-loss'}`} aria-hidden="true">
                {flash.kind === 'up' ? '▲' : '▼'}
              </span>
            ) : null}
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </div>
        );
      })}
    </div>
  );
});
