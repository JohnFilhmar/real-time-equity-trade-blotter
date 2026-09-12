import type { TradeListQuery } from './trade_query';

/**
 * Query keys for everything the blotter reads.
 *
 * Declared once so a socket handler and a hook can never disagree about which cache entry a trade
 * lives in. Prefixes nest: invalidating `trade_keys.all` covers every list, detail and history.
 */
export const trade_keys = {
  all: ['trades'] as const,
  lists: () => ['trades', 'list'] as const,
  list: (query: TradeListQuery) => ['trades', 'list', query] as const,
  detail: (trade_id: string) => ['trades', 'detail', trade_id] as const,
  events: (trade_id: string) => ['trades', 'events', trade_id] as const,
};

/** Query keys for the positions view. */
export const position_keys = {
  all: ['positions'] as const,
};

/** Query keys for the global event feed. */
export const event_feed_keys = {
  all: ['event_feed'] as const,
};
