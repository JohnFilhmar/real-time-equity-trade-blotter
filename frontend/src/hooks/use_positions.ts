'use client';

import { useInfiniteQuery, useQuery, type UseInfiniteQueryResult, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Position, TradeEvent, TradeEventList } from '@blotter/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { list_event_feed, list_positions } from '@/lib/api/position_api';
import { event_feed_keys, position_keys } from '@/lib/query/keys';
import { useAccessToken } from '@/providers/session_provider';

/**
 * Reads the positions. Marked stale by every broadcast, so an open positions view refetches as
 * the book moves and a closed one costs nothing.
 *
 * @returns The query.
 */
export function usePositions(): UseQueryResult<Position[]> {
  const token = useAccessToken();

  return useQuery({
    queryKey: position_keys.all,
    queryFn: () => list_positions(token),
  });
}

/** Events fetched per page of the audit feed. */
export const event_page_size = 100;

/** What the audit view reads. */
export interface EventFeedResult {
  query: UseInfiniteQueryResult<InfiniteData<TradeEventList>>;
  events: readonly TradeEvent[];
  total: number;
}

/**
 * Reads the global audit feed, newest first, page by page.
 *
 * @returns The query, the flattened events and the server total.
 */
export function useEventFeed(): EventFeedResult {
  const token = useAccessToken();

  const query = useInfiniteQuery({
    queryKey: event_feed_keys.all,
    queryFn: ({ pageParam, signal }) =>
      list_event_feed(token, { limit: event_page_size, cursor: typeof pageParam === 'string' ? pageParam : undefined }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const events = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  return { query, events, total };
}
