import type { CreateTrade, Trade, TradeQuery } from '@blotter/shared';
import type { TradePage, TradeChanges, TradeRepository } from '../interfaces/trade_repository.js';

/** Where the in-memory business identifiers start, matching the database sequence. */
const first_trade_number = 100_001;

/**
 * Compares two trades on the requested column.
 *
 * @param a - Left trade.
 * @param b - Right trade.
 * @param column - The column to compare on.
 * @returns Negative, zero or positive, as a comparator.
 */
function compare_on(a: Trade, b: Trade, column: TradeQuery['sort_by']): number {
  switch (column) {
    case 'quantity':
      return a.quantity - b.quantity;
    case 'price':
      return a.price - b.price;
    case 'symbol':
      return a.symbol.localeCompare(b.symbol);
    case 'trader':
      return a.trader.localeCompare(b.trader);
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
 * Strips keys whose value is explicitly `undefined`.
 *
 * An amendment payload carries a key for every field the client could have changed, so spreading
 * it directly would overwrite a symbol with `undefined`. The Postgres repository avoids this by
 * building its `data` field by field; this is the same guard in one place.
 *
 * @param changes - The requested changes, possibly holding explicit undefined values.
 * @returns The same object with only the keys that carry a value.
 */
function drop_undefined(changes: TradeChanges): Partial<CreateTrade> {
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
 * `null` from a write that matched nothing, so a test passing here means something about
 * production.
 *
 * @param initial - Trades to start with. Defaults to empty.
 * @returns A repository backed by process memory.
 */
export function create_in_memory_trade_repository(initial: Trade[] = []): TradeRepository {
  const trades = new Map<string, Trade>(initial.map((trade) => [trade.tradeId, trade]));
  let next_number = first_trade_number + trades.size;

  return {
    async list(query: TradeQuery): Promise<TradePage> {
      const matched = [...trades.values()].filter(
        (trade) =>
          matches_text(trade.symbol, query.symbol) &&
          matches_text(trade.trader, query.trader) &&
          matches_text(trade.book, query.book) &&
          (query.side === undefined || trade.side === query.side) &&
          (query.status === undefined || trade.status === query.status),
      );

      const direction = query.sort_dir === 'asc' ? 1 : -1;
      matched.sort((a, b) => compare_on(a, b, query.sort_by) * direction);

      return {
        trades: matched.slice(query.offset, query.offset + query.limit),
        total: matched.length,
      };
    },

    async find_by_trade_id(trade_id: string): Promise<Trade | null> {
      return trades.get(trade_id) ?? null;
    },

    async create(input: CreateTrade): Promise<Trade> {
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
      return amended;
    },

    async cancel(trade_id: string, expected_version?: number): Promise<Trade | null> {
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
      return cancelled;
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
