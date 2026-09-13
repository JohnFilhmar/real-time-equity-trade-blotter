import type { InfiniteData } from '@tanstack/react-query';
import type { Position, TradeEvent, TradeEventList } from '@blotter/shared';

/** The cached shape of the global audit feed: pages newest first. */
export type EventPages = InfiniteData<TradeEventList>;

/**
 * Places a broadcast audit event at the top of the cached feed.
 *
 * The feed is newest first and the broadcast is by definition the newest row, so it goes to the
 * head of page zero; the total on every page moves by one so the "loaded of total" count stays
 * honest. An event already present, because this client's own mutation and the socket echo can
 * both deliver it, is left alone.
 *
 * @param data - The cached pages, or `undefined` when the feed has not been opened.
 * @param event - The event as the server recorded it.
 * @returns The new cache value, or the same reference when nothing changed.
 */
export function apply_event_to_feed(data: EventPages | undefined, event: TradeEvent): EventPages | undefined {
  if (data === undefined) {
    return data;
  }

  if (data.pages.some((page) => page.data.some((row) => row.id === event.id))) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page, index) => ({
      ...page,
      data: index === 0 ? [event, ...page.data] : page.data,
      total: page.total + 1,
    })),
  };
}

/**
 * Adds a broadcast audit event to one trade's cached history, oldest first.
 *
 * @param events - The cached history, or `undefined` when the drawer has not loaded it.
 * @param event - The event as the server recorded it.
 * @returns The new history, or the same reference when nothing changed.
 */
export function apply_event_to_history(events: TradeEvent[] | undefined, event: TradeEvent): TradeEvent[] | undefined {
  if (events === undefined || events.some((row) => row.id === event.id)) {
    return events;
  }

  return [...events, event].sort((a, b) => a.version - b.version);
}

/**
 * Replaces one symbol's position in the cached list, or inserts it, or removes it when the server
 * says the book is flat with no trades left.
 *
 * @param positions - The cached positions, or `undefined` before the first load.
 * @param position - The recomputed position for one symbol.
 * @returns The new list sorted by symbol, or the same reference when nothing is loaded.
 */
export function apply_position(positions: Position[] | undefined, position: Position): Position[] | undefined {
  if (positions === undefined) {
    return positions;
  }

  const others = positions.filter((row) => row.symbol !== position.symbol);
  const next = position.tradeCount === 0 ? others : [...others, position];
  return next.sort((a, b) => a.symbol.localeCompare(b.symbol, 'en'));
}
