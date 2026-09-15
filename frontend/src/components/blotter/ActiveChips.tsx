import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/Badges';
import { format_date_time } from '@/lib/format/clock';
import { filter_keys, type FilterKey, type TradeListQuery } from '@/lib/query/tradeQuery';

const labels: Record<FilterKey, string> = {
  symbol: 'Symbol',
  side: 'Side',
  status: 'Status',
  trader: 'Trader',
  book: 'Book',
  counterparty: 'Counterparty',
  date_from: 'From',
  date_to: 'To',
};

/**
 * One chip per active filter, each removable, so the toolbar always says what the grid is showing
 * even when the rail is collapsed.
 *
 * @param props - The query and the remove handler.
 * @returns The chips, or a single "No filters" chip.
 */
export function ActiveChips({
  query,
  onRemove,
}: {
  query: TradeListQuery;
  onRemove: (key: FilterKey) => void;
}): ReactNode {
  const active = filter_keys.filter((key) => query[key] !== undefined && query[key].length > 0);

  if (active.length === 0) {
    return <Chip label="No filters" />;
  }

  return (
    <>
      {active.map((key) => {
        const raw = query[key] ?? '';
        const value = key === 'date_from' || key === 'date_to' ? format_date_time(raw) : raw;
        return <Chip key={key} label={labels[key]} value={value} onRemove={() => onRemove(key)} />;
      })}
    </>
  );
}
