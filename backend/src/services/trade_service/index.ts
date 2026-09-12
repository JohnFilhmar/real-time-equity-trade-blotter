import {
  find_instrument,
  type AmendTrade,
  type CreateTrade,
  type Position,
  type Trade,
  type TradeEvent,
  type TradeEventList,
  type TradeEventQuery,
  type TradeList,
  type TradeQuery,
} from '@blotter/shared';
import type { TradeBroadcaster } from '../../interfaces/trade_broadcaster.js';
import type { TradeRepository } from '../../interfaces/trade_repository.js';
import type { TradeActor, TradeService } from '../../interfaces/trade_service.js';
import { AppError } from '../../lib/errors/app_error.js';
import { enforce_notional_limit, enforce_ownership, explain_failed_write } from './rules.js';

export type { TradeActor, TradeService } from '../../interfaces/trade_service.js';

/**
 * Builds the trade service.
 *
 * The broadcaster is a collaborator rather than something reached for inside the methods, so a
 * test can assert what was announced, and so the live feed gets the same broadcasts as a human
 * request without any special casing.
 *
 * @param repository - Persistence port.
 * @param broadcaster - Real-time port.
 * @returns The service.
 */
export function create_trade_service(
  repository: TradeRepository,
  broadcaster: TradeBroadcaster,
): TradeService {
  /**
   * Reads a trade or fails with the 404 every caller would otherwise have to write itself.
   *
   * @param trade_id - The trade to read.
   * @returns The trade.
   * @throws {AppError} 404 when it does not exist.
   */
  async function require_trade(trade_id: string): Promise<Trade> {
    const trade = await repository.find_by_trade_id(trade_id);

    if (trade === null) {
      throw AppError.not_found('trade', trade_id);
    }

    return trade;
  }

  return {
    async list(query: TradeQuery): Promise<TradeList> {
      const page = await repository.list(query);

      return {
        data: page.trades,
        total: page.total,
        limit: query.limit,
        next_cursor: page.next_cursor,
      };
    },

    async get(trade_id: string): Promise<Trade> {
      return require_trade(trade_id);
    },

    async create(input: CreateTrade, actor: TradeActor): Promise<Trade> {
      const instrument = find_instrument(input.symbol);

      // The symbol is a Zod enum over this same universe, so a miss here means the two lists have
      // drifted, which is a programming error rather than a client one.
      if (instrument === undefined) {
        throw new Error(`symbol ${input.symbol} is not in the instrument universe`);
      }

      enforce_notional_limit(input.quantity, input.price, instrument.currency);

      const trade = await repository.create({
        ...input,
        trader: actor.trader_code,
        currency: instrument.currency,
      });

      broadcaster.trade_created(trade);
      return trade;
    },

    async amend(trade_id: string, input: AmendTrade, actor: TradeActor): Promise<Trade> {
      const { version, ...changes } = input;

      if (Object.keys(changes).length === 0) {
        throw AppError.validation_failed('An amendment must change at least one field');
      }

      const current = await require_trade(trade_id);
      enforce_ownership(current, actor, 'trade.amend.any', 'amend');

      enforce_notional_limit(
        changes.quantity ?? current.quantity,
        changes.price ?? current.price,
        current.currency,
      );

      const amended = await repository.amend(trade_id, version, changes, {
        source: actor.source,
        actor: actor.trader_code,
      });

      if (amended === null) {
        return explain_failed_write(repository, trade_id, 'amended');
      }

      broadcaster.trade_amended(amended);
      return amended;
    },

    async cancel(
      trade_id: string,
      expected_version: number | undefined,
      actor: TradeActor,
    ): Promise<Trade> {
      const current = await require_trade(trade_id);
      enforce_ownership(current, actor, 'trade.cancel.any', 'cancel');

      const cancelled = await repository.cancel(trade_id, expected_version, {
        source: actor.source,
        actor: actor.trader_code,
      });

      if (cancelled === null) {
        return explain_failed_write(repository, trade_id, 'cancelled');
      }

      broadcaster.trade_cancelled(cancelled);
      return cancelled;
    },

    async list_events(trade_id: string): Promise<TradeEvent[]> {
      await require_trade(trade_id);
      return repository.find_events(trade_id);
    },

    async list_all_events(query: TradeEventQuery): Promise<TradeEventList> {
      const page = await repository.list_events(query);

      return {
        data: page.events,
        total: page.total,
        limit: query.limit,
        next_cursor: page.next_cursor,
      };
    },

    async list_positions(): Promise<Position[]> {
      return repository.aggregate_positions();
    },
  };
}
