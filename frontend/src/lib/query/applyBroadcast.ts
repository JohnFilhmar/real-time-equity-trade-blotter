import type { InfiniteData } from '@tanstack/react-query';
import type { Trade, TradeList, TradeSortColumn } from '@blotter/shared';
import type { TradeListQuery } from './tradeQuery';

/** The cached shape of one blotter list: pages in fetch order. */
export type TradePages = InfiniteData<TradeList>;

/**
 * Whether a trade satisfies a list query's filters.
 *
 * Mirrors the server's `build_where`: text filters are case-insensitive substrings, side and
 * status are exact, and the date range is inclusive on both ends. Kept in step so a broadcast can
 * be placed into a filtered view without asking the server.
 *
 * @param trade - The trade that changed.
 * @param query - The view's filters.
 * @returns True when the trade belongs in the view.
 */
export function matches_query(trade: Trade, query: TradeListQuery): boolean {
  const contains = (haystack: string, needle: string | undefined): boolean =>
    needle === undefined || needle.length === 0 || haystack.toLowerCase().includes(needle.toLowerCase());

  if (!contains(trade.symbol, query.symbol)) return false;
  if (!contains(trade.trader, query.trader)) return false;
  if (!contains(trade.book, query.book)) return false;
  if (!contains(trade.counterparty, query.counterparty)) return false;
  if (query.side !== undefined && trade.side !== query.side) return false;
  if (query.status !== undefined && trade.status !== query.status) return false;

  const executed = Date.parse(trade.tradeTimestamp);
  if (query.date_from !== undefined && executed < Date.parse(query.date_from)) return false;
  if (query.date_to !== undefined && executed > Date.parse(query.date_to)) return false;

  return true;
}

/**
 * Orders two trades the way the server does for a sort column, with `id` as the tiebreaker.
 *
 * @param a - First trade.
 * @param b - Second trade.
 * @param sort_by - The column.
 * @param sort_dir - The direction.
 * @returns Negative when `a` sorts first.
 */
export function compare_trades(
  a: Trade,
  b: Trade,
  sort_by: TradeSortColumn,
  sort_dir: 'asc' | 'desc',
): number {
  const x = a[sort_by];
  const y = b[sort_by];
  const primary =
    typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en');
  const ordered = primary !== 0 ? primary : a.id.localeCompare(b.id, 'en');
  return sort_dir === 'asc' ? ordered : -ordered;
}

/**
 * Finds a trade across the loaded pages.
 *
 * @param pages - The loaded pages.
 * @param id - The trade's row id.
 * @returns Its page and index, or `null`.
 */
function locate(pages: readonly TradeList[], id: string): { page: number; index: number } | null {
  for (let page = 0; page < pages.length; page += 1) {
    const index = pages[page]?.data.findIndex((row) => row.id === id) ?? -1;
    if (index >= 0) {
      return { page, index };
    }
  }
  return null;
}

/**
 * Applies one changed trade to the cached list for a view.
 *
 * Three rules, in order. A trade whose version is not greater than the cached row's is stale or
 * duplicated and is dropped, which is what keeps a late-arriving amendment from rolling back a
 * newer one. A trade already in the view is patched in place, or removed if it no longer matches
 * the filters. A trade not yet in the view is inserted at its sorted position among the loaded
 * rows, unless that position lies beyond the loaded window, in which case only the total moves and
 * the row arrives with the next page. Page boundaries are never re-chunked, so every stored
 * cursor keeps naming a real row.
 *
 * The same function serves a socket broadcast and the answer to this client's own mutation, so
 * the two paths cannot disagree about where a row goes.
 *
 * @param data - The cached pages, or `undefined` when nothing is loaded yet.
 * @param trade - The trade as the server now holds it.
 * @param query - The view's filters and sort.
 * @returns The new cache value, or the same reference when nothing changed.
 */
export function apply_trade(
  data: TradePages | undefined,
  trade: Trade,
  query: TradeListQuery,
): TradePages | undefined {
  if (data === undefined) {
    return data;
  }

  const pages = data.pages;
  const found = locate(pages, trade.id);
  const belongs = matches_query(trade, query);

  if (found !== null) {
    const current = pages[found.page]?.data[found.index];

    if (current === undefined || current.version >= trade.version) {
      return data;
    }

    const next_pages = pages.map((page, page_index) => {
      if (page_index !== found.page) {
        return belongs ? page : { ...page, total: Math.max(0, page.total - 1) };
      }

      const rows = belongs
        ? page.data.map((row, row_index) => (row_index === found.index ? trade : row))
        : page.data.filter((_row, row_index) => row_index !== found.index);

      return { ...page, data: rows, total: belongs ? page.total : Math.max(0, page.total - 1) };
    });

    return { ...data, pages: next_pages };
  }

  if (!belongs) {
    return data;
  }

  const last_page = pages.at(-1);
  const all_loaded = last_page === undefined || last_page.next_cursor === null;
  let inserted = false;

  const next_pages = pages.map((page, page_index) => {
    if (inserted) {
      return { ...page, total: page.total + 1 };
    }

    const index = page.data.findIndex((row) => compare_trades(trade, row, query.sort_by, query.sort_dir) < 0);
    const is_last = page_index === pages.length - 1;

    if (index >= 0) {
      inserted = true;
      return { ...page, data: [...page.data.slice(0, index), trade, ...page.data.slice(index)], total: page.total + 1 };
    }

    if (is_last && all_loaded) {
      inserted = true;
      return { ...page, data: [...page.data, trade], total: page.total + 1 };
    }

    return { ...page, total: page.total + 1 };
  });

  return { ...data, pages: next_pages };
}
