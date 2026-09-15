'use client';

import { hashKey, keepPreviousData, useInfiniteQuery, useQuery, type UseInfiniteQueryResult, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Trade, TradeEvent } from '@blotter/shared';
import { get_trade, list_trade_events, list_trades } from '@/lib/api/tradeApi';
import type { TradePages } from '@/lib/query/applyBroadcast';
import { trade_keys } from '@/lib/query/keys';
import type { TradeListQuery } from '@/lib/query/tradeQuery';
import { useAccessToken } from '@/providers/SessionProvider';

/** Rows fetched per page. Large enough that a full screen never waits on a second request. */
export const page_size = 200;

/** What the blotter reads from the list query. */
export interface TradesResult {
  query: UseInfiniteQueryResult<TradePages>;
  /** Every loaded row, in server order. */
  rows: readonly Trade[];
  /** How many trades match the filters, from the server. */
  total: number;
  /**
   * Names the list the rows belong to, or `null` while rows from the previous filters stand in as a
   * placeholder. It changes exactly when rows for a new sort or filter land, which is how the grid
   * tells a re-sorted page from trades that just arrived.
   */
  view_key: string | null;
}

/**
 * Reads the blotter for one set of filters and sort, page by page.
 *
 * Sorting, filtering and paging all happen on the server; the client only concatenates pages.
 * Previous rows are kept on screen while a changed filter loads, so the grid never blanks between
 * two filled states.
 *
 * @param list_query - Filters and sort, from the URL.
 * @returns The query, the flattened rows and the server total.
 */
export function useTrades(list_query: TradeListQuery): TradesResult {
  const token = useAccessToken();

  const query = useInfiniteQuery({
    queryKey: trade_keys.list(list_query),
    queryFn: ({ pageParam, signal }) =>
      list_trades(
        token,
        { query: list_query, limit: page_size, cursor: typeof pageParam === 'string' ? pageParam : undefined },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const view_key = query.isPlaceholderData ? null : hashKey(trade_keys.list(list_query));

  return { query, rows, total, view_key };
}

/**
 * Reads one trade by business id.
 *
 * @param trade_id - The `TRD-100001` form, or `null` to read nothing.
 * @returns The query.
 */
export function useTrade(trade_id: string | null): UseQueryResult<Trade> {
  const token = useAccessToken();

  return useQuery({
    queryKey: trade_keys.detail(trade_id ?? ''),
    queryFn: () => get_trade(token, trade_id ?? ''),
    enabled: trade_id !== null,
  });
}

/**
 * Reads one trade's history, oldest first.
 *
 * @param trade_id - The business id, or `null` to read nothing.
 * @returns The query.
 */
export function useTradeEvents(trade_id: string | null): UseQueryResult<TradeEvent[]> {
  const token = useAccessToken();

  return useQuery({
    queryKey: trade_keys.events(trade_id ?? ''),
    queryFn: () => list_trade_events(token, trade_id ?? ''),
    enabled: trade_id !== null,
  });
}
