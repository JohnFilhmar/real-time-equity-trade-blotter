import { z } from 'zod';
import { position_schema, trade_event_list_schema, type Position, type TradeEventList } from '@blotter/shared';
import { api_json } from './http';

/**
 * Reads the net position in every instrument with active trades.
 *
 * @param token - The access token.
 * @returns Positions sorted by symbol.
 */
export function list_positions(token: string): Promise<Position[]> {
  return api_json('/api/v1/positions', z.array(position_schema), { token });
}

/** One page request for the global event feed. */
export interface EventFeedRequest {
  limit: number;
  cursor?: string | undefined;
}

/**
 * Reads one page of the global audit feed, newest first.
 *
 * @param token - The access token.
 * @param request - Page size and cursor.
 * @param signal - Aborts the request when the query is cancelled.
 * @returns The page envelope.
 */
export function list_event_feed(token: string, request: EventFeedRequest, signal?: AbortSignal): Promise<TradeEventList> {
  const params = new URLSearchParams({ limit: request.limit.toString() });
  if (request.cursor !== undefined) {
    params.set('cursor', request.cursor);
  }
  return api_json(`/api/v1/trades/events?${params.toString()}`, trade_event_list_schema, {
    token,
    ...(signal === undefined ? {} : { signal }),
  });
}
