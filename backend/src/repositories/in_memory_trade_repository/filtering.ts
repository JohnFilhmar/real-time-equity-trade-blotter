import type { Trade, TradeQuery } from '@blotter/shared';

/**
 * Compares two trades on the requested column, falling back to the row id.
 *
 * The id tiebreaker is what makes cursor paging work: two trades with the same timestamp must not
 * swap places between requests, or "everything after this row" stops meaning anything.
 *
 * @param a - Left trade.
 * @param b - Right trade.
 * @param column - The column to compare on.
 * @returns Negative, zero or positive, as a comparator.
 */
export function compare_on(a: Trade, b: Trade, column: TradeQuery['sort_by']): number {
  const primary = compare_column(a, b, column);
  return primary === 0 ? a.id.localeCompare(b.id) : primary;
}

/**
 * Compares two trades on one column.
 *
 * @param a - Left trade.
 * @param b - Right trade.
 * @param column - The column to compare on.
 * @returns Negative, zero or positive.
 */
function compare_column(a: Trade, b: Trade, column: TradeQuery['sort_by']): number {
  switch (column) {
    case 'quantity':
      return a.quantity - b.quantity;
    case 'price':
      return a.price - b.price;
    case 'tradeId':
      return a.tradeId.localeCompare(b.tradeId);
    case 'symbol':
      return a.symbol.localeCompare(b.symbol);
    case 'side':
      return a.side.localeCompare(b.side);
    case 'trader':
      return a.trader.localeCompare(b.trader);
    case 'book':
      return a.book.localeCompare(b.book);
    case 'counterparty':
      return a.counterparty.localeCompare(b.counterparty);
    case 'status':
      return a.status.localeCompare(b.status);
    default:
      return a.tradeTimestamp.localeCompare(b.tradeTimestamp);
  }
}

/**
 * Checks a trade against a free-text filter the same way the Postgres repository does.
 *
 * @param value - The field being filtered.
 * @param filter - The filter, or `undefined` when it was not supplied.
 * @returns True when the filter is absent or matches case-insensitively.
 */
export function matches_text(value: string, filter?: string): boolean {
  return filter === undefined || value.toLowerCase().includes(filter.toLowerCase());
}

/**
 * Checks a trade's execution time against the requested range.
 *
 * @param timestamp - The trade's execution time, as an ISO string.
 * @param query - The parsed query, which may carry either bound or neither.
 * @returns True when the trade sits inside the range.
 */
export function within_range(timestamp: string, query: TradeQuery): boolean {
  const at = Date.parse(timestamp);
  const after = query.date_from === undefined || at >= Date.parse(query.date_from);
  const before = query.date_to === undefined || at <= Date.parse(query.date_to);
  return after && before;
}
