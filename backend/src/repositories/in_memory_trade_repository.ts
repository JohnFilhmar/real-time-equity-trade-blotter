import type { AmendableTrade, Trade, TradeEvent, TradeQuery } from '@blotter/shared';
import type {
  NewTrade,
  TradePage,
  TradeChanges,
  TradeRepository,
  TradeWriteContext,
} from '../interfaces/trade_repository.js';
import {
  build_cancellation_change_set,
  build_change_set,
} from '../lib/audit/build_change_set.js';
import { decode_cursor, encode_cursor } from '../lib/paging/cursor.js';

/** Where the in-memory business identifiers start, matching the database sequence. */
const first_trade_number = 100_001;

/**
 * Compares two trades on the requested column, falling back to the row id.
 *
 * The id tiebreaker is what makes cursor paging work: two trades with the same timestamp must not
 * swap places between requests, or "everything after this row" stops meaning anything.
 *
 * @param a - Left trade.
 * @param b - Right trade.
 * @param column - The column to compare on.
 * @returns Negative, zero or positive, as a comparator.
 */
function compare_on(a: Trade, b: Trade, column: TradeQuery['sort_by']): number {
  const primary = compare_column(a, b, column);
  return primary === 0 ? a.id.localeCompare(b.id) : primary;
}

/**
 * Compares two trades on one column.
 *
 * @param a - Left trade.
 * @param b - Right trade.
 * @param column - The column to compare on.
 * @returns Negative, zero or positive.
 */
function compare_column(a: Trade, b: Trade, column: TradeQuery['sort_by']): number {
  switch (column) {
    case 'quantity':
      return a.quantity - b.quantity;
    case 'price':
      return a.price - b.price;
    case 'tradeId':
      return a.tradeId.localeCompare(b.tradeId);
    case 'symbol':
      return a.symbol.localeCompare(b.symbol);
    case 'side':
      return a.side.localeCompare(b.side);
    case 'trader':
      return a.trader.localeCompare(b.trader);
    case 'book':
      return a.book.localeCompare(b.book);
    case 'counterparty':
      return a.counterparty.localeCompare(b.counterparty);
    case 'status':
      return a.status.localeCompare(b.status);
    default:
      return a.tradeTimestamp.localeCompare(b.tradeTimestamp);
  }
}

/**
 * Checks a trade against a free-text filter the same way the Postgres repository does.
 *
 * @param value - The field being filtered.
 * @param filter - The filter, or `undefined` when it was not supplied.
 * @returns True when the filter is absent or matches case-insensitively.
 */
function matches_text(value: string, filter?: string): boolean {
  return filter === undefined || value.toLowerCase().includes(filter.toLowerCase());
}

/**
 * Checks a trade's execution time against the requested range.
 *
 * @param timestamp - The trade's execution time, as an ISO string.
 * @param query - The parsed query, which may carry either bound or neither.
 * @returns True when the trade sits inside the range.
 */
function within_range(timestamp: string, query: TradeQuery): boolean {
  const at = Date.parse(timestamp);
  const after = query.date_from === undefined || at >= Date.parse(query.date_from);
  const before = query.date_to === undefined || at <= Date.parse(query.date_to);
  return after && before;
}

/**
 * Strips keys whose value is explicitly `undefined`.
 *
 * An amendment payload carries a key for every field the client could have changed, so spreading
 * it directly would overwrite a quantity with `undefined`. The Postgres repository avoids this by
 * building its `data` field by field; this is the same guard in one place.
 *
 * @param changes - The requested changes, possibly holding explicit undefined values.
 * @returns The same object with only the keys that carry a value.
 */
function drop_undefined(changes: TradeChanges): Partial<AmendableTrade> {
  return Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
}

/**
 * A second implementation of {@link TradeRepository} that keeps everything in a map.
 *
 * It exists so the service and the routes can be tested against a real implementation of the port
 * rather than a mock asserting which methods were called, and so the API can be demonstrated
 * without a database. Its behaviour deliberately mirrors the Postgres one, including returning
 * `null` from a write that matched nothing and writing an event row alongside every amendment and
 * cancellation, so a test passing here means something about production.
 *
 * @param initial - Trades to start with. Defaults to empty.
 * @returns A repository backed by process memory.
 */
export function create_in_memory_trade_repository(initial: Trade[] = []): TradeRepository {
  const trades = new Map<string, Trade>(initial.map((trade) => [trade.tradeId, trade]));
  const events: TradeEvent[] = [];
  let next_number = first_trade_number + trades.size;

  /**
   * Appends one history entry.
   *
   * @param trade - The trade after the change.
   * @param action - What happened.
   * @param context - Who did it and where it came from.
   * @param changes - What moved.
   * @param fallback_actor - Used when the context names no actor.
   */
  function record(
    trade: Trade,
    action: TradeEvent['action'],
    context: TradeWriteContext,
    changes: TradeEvent['changes'],
    fallback_actor: string,
  ): void {
    events.push({
      id: crypto.randomUUID(),
      tradeId: trade.tradeId,
      version: trade.version,
      action,
      source: context.source,
      changes,
      actor: context.actor ?? fallback_actor,
      occurredAt: trade.updatedAt,
    });
  }

  return {
    async list(query: TradeQuery): Promise<TradePage> {
      const matched = [...trades.values()].filter(
        (trade) =>
          matches_text(trade.symbol, query.symbol) &&
          matches_text(trade.trader, query.trader) &&
          matches_text(trade.book, query.book) &&
          matches_text(trade.counterparty, query.counterparty) &&
          (query.side === undefined || trade.side === query.side) &&
          (query.status === undefined || trade.status === query.status) &&
          within_range(trade.tradeTimestamp, query),
      );

      const direction = query.sort_dir === 'asc' ? 1 : -1;
      matched.sort((a, b) => compare_on(a, b, query.sort_by) * direction);

      const cursor_id = decode_cursor(query.cursor);
      const start =
        cursor_id === undefined ? 0 : matched.findIndex((trade) => trade.id === cursor_id) + 1;

      const page = matched.slice(start, start + query.limit);
      const last = page.at(-1);

      return {
        trades: page,
        total: matched.length,
        next_cursor:
          page.length === query.limit && last !== undefined ? encode_cursor(last.id) : null,
      };
    },

    async find_by_trade_id(trade_id: string): Promise<Trade | null> {
      return trades.get(trade_id) ?? null;
    },

    async create(input: NewTrade): Promise<Trade> {
      const now = new Date().toISOString();
      const trade_id = `TRD-${next_number.toString()}`;
      next_number += 1;

      const trade: Trade = {
        id: crypto.randomUUID(),
        tradeId: trade_id,
        symbol: input.symbol,
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        currency: input.currency,
        trader: input.trader,
        book: input.book,
        counterparty: input.counterparty,
        tradeTimestamp: input.tradeTimestamp,
        status: 'ACTIVE',
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      trades.set(trade_id, trade);
      return trade;
    },

    async amend(
      trade_id: string,
      expected_version: number,
      changes: TradeChanges,
      context: TradeWriteContext,
    ): Promise<Trade | null> {
      const current = trades.get(trade_id);

      if (
        current === undefined ||
        current.status !== 'ACTIVE' ||
        current.version !== expected_version
      ) {
        return null;
      }

      const amended: Trade = {
        ...current,
        ...drop_undefined(changes),
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };

      trades.set(trade_id, amended);
      record(amended, 'AMENDED', context, build_change_set(current, changes), current.trader);

      return amended;
    },

    async cancel(
      trade_id: string,
      expected_version: number | undefined,
      context: TradeWriteContext,
    ): Promise<Trade | null> {
      const current = trades.get(trade_id);

      if (
        current === undefined ||
        current.status !== 'ACTIVE' ||
        (expected_version !== undefined && current.version !== expected_version)
      ) {
        return null;
      }

      const cancelled: Trade = {
        ...current,
        status: 'CANCELLED',
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };

      trades.set(trade_id, cancelled);
      record(cancelled, 'CANCELLED', context, build_cancellation_change_set(), current.trader);

      return cancelled;
    },

    async find_events(trade_id: string): Promise<TradeEvent[]> {
      return events
        .filter((event) => event.tradeId === trade_id)
        .sort((a, b) => a.version - b.version);
    },

    async find_random_active(): Promise<Trade | null> {
      const active = [...trades.values()].filter((trade) => trade.status === 'ACTIVE');

      if (active.length === 0) {
        return null;
      }

      return active[Math.floor(Math.random() * active.length)] ?? null;
    },
  };
}
