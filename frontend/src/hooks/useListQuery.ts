'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  default_trade_list_query,
  parse_search_params,
  to_search_params,
  type TradeListQuery,
} from '@/lib/query/tradeQuery';

/** The list query and the ways to change it. */
export interface ListQueryState {
  /** The query to show. Carries a change from the moment it is written, before the URL catches up. */
  query: TradeListQuery;

  /** True while a written change has not reached the URL yet. */
  pending: boolean;

  /** Replaces part of the query. Passing `undefined` for a key clears it. */
  update: (patch: Partial<TradeListQuery>) => void;

  /** Clears every filter, keeping the sort. */
  clear_filters: () => void;

  /** Sorts by a column: same column flips direction, a new column starts ascending, time descending. */
  sort_by: (column: TradeListQuery['sort_by']) => void;
}

/** A change written to the URL, and the address it was written from. */
interface WrittenQuery {
  query: TradeListQuery;
  /** The search string when the change was written. The change stops applying once the URL leaves it. */
  from: string;
}

/**
 * Holds the blotter's filters and sort in the URL.
 *
 * The URL is the store, so a filtered view is linkable, survives a reload, and the browser back
 * button undoes a filter. Writes use `replace` with scrolling off so the grid does not jump.
 *
 * A write takes a moment to reach the URL, and a caret that waited for it would lag the click. So
 * the written query is shown straight away and held until the URL moves, whether to the written
 * view or to another one through the back button; from then on the URL is read again.
 *
 * @returns The current query, whether a write is still on its way, and the setters.
 */
export function useListQuery(): ListQueryState {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  const url_query = useMemo(() => parse_search_params(new URLSearchParams(search)), [search]);
  const [written, setWritten] = useState<WrittenQuery | null>(null);

  if (written !== null && written.from !== search) {
    setWritten(null);
  }

  const pending = written !== null && written.from === search;
  const query = pending ? written.query : url_query;

  const write = useCallback(
    (next: TradeListQuery) => {
      const params = to_search_params(next).toString();
      setWritten({ query: next, from: search });
      router.replace(params.length === 0 ? pathname : `${pathname}?${params}`, { scroll: false });
    },
    [pathname, router, search],
  );

  const update = useCallback(
    (patch: Partial<TradeListQuery>) => {
      const merged: TradeListQuery = { ...query, ...patch };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') {
          delete merged[key as keyof TradeListQuery];
        }
      }
      write({ ...default_trade_list_query, ...merged });
    },
    [query, write],
  );

  const clear_filters = useCallback(() => {
    write({ ...default_trade_list_query, sort_by: query.sort_by, sort_dir: query.sort_dir });
  }, [query.sort_by, query.sort_dir, write]);

  const sort_by = useCallback(
    (column: TradeListQuery['sort_by']) => {
      if (column === query.sort_by) {
        update({ sort_dir: query.sort_dir === 'asc' ? 'desc' : 'asc' });
      } else {
        update({ sort_by: column, sort_dir: column === 'tradeTimestamp' ? 'desc' : 'asc' });
      }
    },
    [query.sort_by, query.sort_dir, update],
  );

  return { query, pending, update, clear_filters, sort_by };
}
