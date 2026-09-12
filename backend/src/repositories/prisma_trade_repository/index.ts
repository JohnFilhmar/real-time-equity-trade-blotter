import type { Position, Trade, TradeEvent, TradeEventQuery, TradeQuery } from '@blotter/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type {
  NewTrade,
  TradeEventPage,
  TradePage,
  TradeChanges,
  TradeRepository,
  TradeWriteContext,
} from '../../interfaces/trade_repository.js';
import {
  aggregate_positions,
  find_by_trade_id,
  find_events,
  find_random_active,
  list,
  list_events,
} from './reads.js';
import { amend, cancel, create } from './writes.js';

/**
 * The Postgres-backed implementation of {@link TradeRepository}.
 *
 * Every write is expressed as a conditional `updateMany` rather than a read followed by an update,
 * so the version check and the write happen in one statement and two clients changing the same
 * trade cannot both win. Both writes run inside a transaction with their event row, so the audit
 * trail cannot disagree with the trade.
 *
 * @param prisma - A connected client.
 * @returns A repository bound to that client.
 */
export function create_prisma_trade_repository(prisma: PrismaClient): TradeRepository {
  return {
    async list(query: TradeQuery): Promise<TradePage> {
      return list(prisma, query);
    },

    async find_by_trade_id(trade_id: string): Promise<Trade | null> {
      return find_by_trade_id(prisma, trade_id);
    },

    async create(input: NewTrade): Promise<Trade> {
      return create(prisma, input);
    },

    async amend(
      trade_id: string,
      expected_version: number,
      changes: TradeChanges,
      context: TradeWriteContext,
    ): Promise<Trade | null> {
      return amend(prisma, trade_id, expected_version, changes, context);
    },

    async cancel(
      trade_id: string,
      expected_version: number | undefined,
      context: TradeWriteContext,
    ): Promise<Trade | null> {
      return cancel(prisma, trade_id, expected_version, context);
    },

    async find_events(trade_id: string): Promise<TradeEvent[]> {
      return find_events(prisma, trade_id);
    },

    async list_events(query: TradeEventQuery): Promise<TradeEventPage> {
      return list_events(prisma, query);
    },

    async aggregate_positions(): Promise<Position[]> {
      return aggregate_positions(prisma);
    },

    async find_random_active(): Promise<Trade | null> {
      return find_random_active(prisma);
    },
  };
}
