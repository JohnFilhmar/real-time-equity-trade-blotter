import type { QueryClient } from '@tanstack/react-query';
import type { Trade } from '@blotter/shared';
import { apply_trade, type TradePages } from './apply_broadcast';
import { event_feed_keys, position_keys, trade_keys } from './keys';
import { trade_list_query_schema } from './trade_query';

/**
 * Writes one changed trade into every cache that holds it.
 *
 * Every blotter list is keyed by its own filters and sort, and the key carries them, so the trade
 * can be placed correctly in each view without asking the server. The detail entry is replaced,
 * and the history, positions and event feed are marked stale so an open view refetches while a
 * closed one costs nothing.
 *
 * Used for a socket broadcast and for the answer to this client's own mutation alike, so the two
 * paths cannot disagree about where a row goes.
 *
 * @param query_client - The cache.
 * @param trade - The trade as the server now holds it.
 */
export function settle_trade(query_client: QueryClient, trade: Trade): void {
  for (const [key] of query_client.getQueriesData<TradePages>({ queryKey: trade_keys.lists() })) {
    const parsed = trade_list_query_schema.safeParse(key[2]);
    if (!parsed.success) {
      continue;
    }
    query_client.setQueryData<TradePages>(key, (old) => apply_trade(old, trade, parsed.data));
  }

  query_client.setQueryData(trade_keys.detail(trade.tradeId), trade);
  void query_client.invalidateQueries({ queryKey: trade_keys.events(trade.tradeId) });
  void query_client.invalidateQueries({ queryKey: position_keys.all });
  void query_client.invalidateQueries({ queryKey: event_feed_keys.all });
}
