import type { ColumnDef } from '@tanstack/react-table';
import type { Trade, TradeSortColumn } from '@blotter/shared';
import { SideMark, StatusBadge, VersionPill } from '@/components/ui/Badges';
import { format_clock_or_date } from '@/lib/format/clock';
import { format_notional, format_quantity } from '@/lib/format/money';
import { PriceCell } from './PriceCell';

/**
 * Grid tracks per breakpoint. Each list has exactly as many entries as there are visible columns
 * at that width, so a hidden cell never leaves an empty track behind.
 */
export const grid_template_classes =
  'grid-cols-[92px_72px_48px_88px_96px_82px_106px_110px] lg:grid-cols-[96px_76px_50px_96px_100px_86px_152px_108px_110px] xl:grid-cols-[96px_76px_50px_96px_100px_112px_86px_120px_152px_108px_110px]';

/** Minimum grid width per breakpoint, so the tracks above never collapse. */
export const grid_min_width_classes = 'min-w-[720px] lg:min-w-[940px] xl:min-w-[1140px]';

/** Height of one row, matching the `row` spacing token. */
export const row_height = 32;

/** Column ids that can be sorted, which is every column the grid displays. */
export const sortable_columns: ReadonlySet<string> = new Set<TradeSortColumn>([
  'tradeId',
  'symbol',
  'side',
  'quantity',
  'price',
  'trader',
  'book',
  'counterparty',
  'tradeTimestamp',
  'status',
]);

/**
 * The blotter's columns, in display order.
 *
 * Notional is derived rather than served, so it is display-only and not sortable. The London
 * names price in GBX, so the price cell carries the currency code; a column that formatted
 * everything as dollars would be wrong for a third of the universe.
 */
export const trade_columns: ColumnDef<Trade>[] = [
  {
    id: 'tradeId',
    accessorKey: 'tradeId',
    header: 'Trade ID',
    cell: ({ getValue }) => <span className="font-mono text-[11.5px] text-brand">{getValue<string>()}</span>,
  },
  {
    id: 'symbol',
    accessorKey: 'symbol',
    header: 'Symbol',
    cell: ({ getValue }) => <span className="font-semibold tracking-[-.005em]">{getValue<string>()}</span>,
  },
  {
    id: 'side',
    accessorKey: 'side',
    header: 'Side',
    cell: ({ row }) => <SideMark side={row.original.side} />,
  },
  {
    id: 'quantity',
    accessorKey: 'quantity',
    header: 'Quantity',
    meta: { numeric: true },
    cell: ({ getValue }) => format_quantity(getValue<number>()),
  },
  {
    id: 'price',
    accessorKey: 'price',
    header: 'Price',
    meta: { numeric: true },
    cell: ({ row }) => <PriceCell trade={row.original} />,
  },
  {
    id: 'notional',
    header: 'Notional',
    meta: { numeric: true, class_name: 'hidden xl:block' },
    enableSorting: false,
    cell: ({ row }) => format_notional(row.original.quantity, row.original.price, row.original.currency),
  },
  {
    id: 'trader',
    accessorKey: 'trader',
    header: 'Trader',
    cell: ({ getValue }) => <span className="truncate text-[12px] text-text-2">{getValue<string>()}</span>,
  },
  {
    id: 'book',
    accessorKey: 'book',
    header: 'Book',
    meta: { class_name: 'hidden xl:block' },
    cell: ({ getValue }) => <span className="truncate text-[12px] text-text-2">{getValue<string>()}</span>,
  },
  {
    id: 'counterparty',
    accessorKey: 'counterparty',
    header: 'Counterparty',
    meta: { class_name: 'hidden lg:block' },
    cell: ({ getValue }) => <span className="truncate text-[12px] text-text-2">{getValue<string>()}</span>,
  },
  {
    id: 'tradeTimestamp',
    accessorKey: 'tradeTimestamp',
    header: 'Time (UTC)',
    cell: ({ getValue }) => <span className="font-mono text-[11px] whitespace-nowrap text-muted">{format_clock_or_date(getValue<string>())}</span>,
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <span className="flex items-center gap-[5px]">
        <StatusBadge status={row.original.status} />
        <VersionPill version={row.original.version} />
      </span>
    ),
  },
];
