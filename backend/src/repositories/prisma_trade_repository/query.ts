import type { TradeQuery } from '@blotter/shared';

/**
 * Builds the Prisma `orderBy` for a validated query.
 *
 * Written as a switch rather than a computed key so the sort column stays a literal Prisma knows,
 * and so an unsupported column cannot be smuggled in from the query string. Every column the grid
 * displays appears here.
 *
 * `id` is always the final tiebreaker. Without it two trades with the same timestamp could swap
 * places between requests, which breaks cursor paging: the cursor names a row, and the row has to
 * sit in the same place next time for "everything after it" to mean anything.
 *
 * @param query - The parsed query.
 * @returns An `orderBy` list, most significant first.
 */
export function build_order_by(query: TradeQuery) {
  const direction = query.sort_dir;

  switch (query.sort_by) {
    case 'tradeId':
      return [{ tradeId: direction }, { id: direction }];
    case 'symbol':
      return [{ symbol: direction }, { id: direction }];
    case 'side':
      return [{ side: direction }, { id: direction }];
    case 'quantity':
      return [{ quantity: direction }, { id: direction }];
    case 'price':
      return [{ price: direction }, { id: direction }];
    case 'trader':
      return [{ trader: direction }, { id: direction }];
    case 'book':
      return [{ book: direction }, { id: direction }];
    case 'counterparty':
      return [{ counterparty: direction }, { id: direction }];
    case 'status':
      return [{ status: direction }, { id: direction }];
    default:
      return [{ tradeTimestamp: direction }, { id: direction }];
  }
}

/**
 * Builds the Prisma `where` for a validated query.
 *
 * The four free-text filters match case-insensitively on a substring, because they sit behind grid
 * filter boxes where someone typing `equities` expects to find `EQUITIES_UK`. That forgoes the
 * btree indexes on those columns, which is acceptable at the dataset size the brief describes and
 * is recorded as a trade-off in the README. The date range is a half-open interval on the
 * execution timestamp, which is what a "Trade date: Today" filter means.
 *
 * @param query - The parsed query.
 * @returns A `where` carrying only the filters that were supplied.
 */
export function build_where(query: TradeQuery) {
  const from = query.date_from === undefined ? {} : { gte: new Date(query.date_from) };
  const to = query.date_to === undefined ? {} : { lte: new Date(query.date_to) };
  const range = { ...from, ...to };

  return {
    ...(query.symbol === undefined
      ? {}
      : { symbol: { contains: query.symbol, mode: 'insensitive' as const } }),
    ...(query.trader === undefined
      ? {}
      : { trader: { contains: query.trader, mode: 'insensitive' as const } }),
    ...(query.book === undefined
      ? {}
      : { book: { contains: query.book, mode: 'insensitive' as const } }),
    ...(query.counterparty === undefined
      ? {}
      : { counterparty: { contains: query.counterparty, mode: 'insensitive' as const } }),
    ...(query.side === undefined ? {} : { side: query.side }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(Object.keys(range).length === 0 ? {} : { tradeTimestamp: range }),
  };
}
