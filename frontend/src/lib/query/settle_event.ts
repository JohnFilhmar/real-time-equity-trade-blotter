import type { QueryClient } from '@tanstack/react-query';
import type { Position, TradeEvent } from '@blotter/shared';
import { apply_event_to_feed, apply_event_to_history, apply_position, type EventPages } from './apply_event';
import { event_feed_keys, position_keys, trade_keys } from './keys';

/**
 * Writes one broadcast audit event into the global feed and the trade's history, wherever either
 * is loaded. No request is made: the event is the row the server stored.
 *
 * @param query_client - The cache.
 * @param event - The event as the server recorded it.
 */
export function settle_event(query_client: QueryClient, event: TradeEvent): void {
  query_client.setQueryData<EventPages>(event_feed_keys.all, (old) => apply_event_to_feed(old, event));
  query_client.setQueryData<TradeEvent[]>(trade_keys.events(event.tradeId), (old) => apply_event_to_history(old, event));
}

/**
 * Writes one recomputed position into the cached list, wherever it is loaded.
 *
 * @param query_client - The cache.
 * @param position - The symbol's position as the server recomputed it after a write.
 */
export function settle_position(query_client: QueryClient, position: Position): void {
  query_client.setQueryData<Position[]>(position_keys.all, (old) => apply_position(old, position));
}
