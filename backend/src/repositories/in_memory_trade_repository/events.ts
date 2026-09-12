import type { TradeEvent, TradeEventQuery } from '@blotter/shared';
import type { TradeEventPage } from '../../interfaces/trade_repository.js';
import { decode_cursor, encode_cursor } from '../../lib/paging/cursor.js';

/**
 * Orders events newest first, falling back to the row id so two events written in the same
 * millisecond keep one order between requests, which is what cursor paging depends on.
 *
 * @param a - Left event.
 * @param b - Right event.
 * @returns Negative when `a` is newer, positive when `b` is, as a comparator.
 */
function newest_first(a: TradeEvent, b: TradeEvent): number {
  const by_time = b.occurredAt.localeCompare(a.occurredAt);
  return by_time === 0 ? b.id.localeCompare(a.id) : by_time;
}

/** The in-memory side of `TradeRepository.find_events`. */
export function find_events(events: TradeEvent[], trade_id: string): TradeEvent[] {
  return events
    .filter((event) => event.tradeId === trade_id)
    .sort((a, b) => a.version - b.version);
}

/** The in-memory side of `TradeRepository.list_events`. */
export function list_events(events: TradeEvent[], query: TradeEventQuery): TradeEventPage {
  const ordered = [...events].sort(newest_first);

  const cursor_id = decode_cursor(query.cursor);
  const start =
    cursor_id === undefined ? 0 : ordered.findIndex((event) => event.id === cursor_id) + 1;

  const page = ordered.slice(start, start + query.limit);
  const last = page.at(-1);

  return {
    events: page,
    total: ordered.length,
    next_cursor:
      page.length === query.limit && last !== undefined ? encode_cursor(last.id) : null,
  };
}
