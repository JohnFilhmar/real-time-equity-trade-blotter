'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  default_trade_list_query,
  parse_search_params,
  to_search_params,
  type TradeListQuery,
} from '@/lib/query/trade_query';

/** The list query and the ways to change it. */
export interface ListQueryState {
  query: TradeListQuery;

  /** Replaces part of the query. Passing `undefined` for a key clears it. */
  update: (patch: Partial<TradeListQuery>) => void;

  /** Clears every filter, keeping the sort. */
  clear_filters: () => void;

  /** Sorts by a column: same column flips direction, a new column starts ascending, time descending. */
  sort_by: (column: TradeListQuery['sort_by']) => void;
}

/**
 * Holds the blotter's filters and sort in the URL.
 *
 * The URL is the store, so a filtered view is linkable, survives a reload, and the browser back
 * button undoes a filter. Writes use `replace` with scrolling off so the grid does not jump.
 *
 * @returns The current query and its setters.
 */
export function useListQuery(): ListQueryState {
  const router = useRouter();
  const pathname = usePathname();
  const search_params = useSearchParams();

  const query = useMemo(() => parse_search_params(new URLSearchParams(search_params.toString())), [search_params]);

  const write = useCallback(
    (next: TradeListQuery) => {
      const params = to_search_params(next).toString();
      router.replace(params.length === 0 ? pathname : `${pathname}?${params}`, { scroll: false });
    },
    [pathname, router],
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

  return { query, update, clear_filters, sort_by };
}
