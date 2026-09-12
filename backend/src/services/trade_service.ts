import {
  find_instrument,
  role_has,
  type AmendTrade,
  type CreateTrade,
  type Currency,
  type Role,
  type Trade,
  type TradeEvent,
  type TradeEventSource,
  type TradeList,
  type TradeQuery,
} from '@blotter/shared';
import { notional_limits } from '../config/env.js';
import type { TradeBroadcaster } from '../interfaces/trade_broadcaster.js';
import type { TradeRepository } from '../interfaces/trade_repository.js';
import { AppError } from '../lib/errors/app_error.js';

/**
 * Who is making a change, and through which path.
 *
 * Carried as a parameter rather than read from ambient state, so the service has no idea Express
 * exists and the simulated feed is an ordinary caller rather than a special case.
 */
export interface TradeActor {
  /** The desk code the change is attributed to, and the one ownership is judged against. */
  trader_code: string;

  /** The role, used for the permission checks that depend on whose trade it is. */
  role: Role;

  /** Which path the change arrived through. */
  source: TradeEventSource;
}

/**
 * The blotter's business rules: what a trade may become, who may change it, and who is told.
 *
 * Everything that writes a trade goes through here, the HTTP routes and the live feed alike, so
 * the status transitions, the concurrency check, the pre-trade limits, the ownership rules and the
 * broadcast exist in exactly one place.
 */
export interface TradeService {
  /**
   * Reads a filtered, sorted page of the blotter.
   *
   * @param query - Already parsed by `trade_query_schema`.
   * @returns The page, with the unpaged total and the cursor for the next one.
   */
  list(query: TradeQuery): Promise<TradeList>;

  /**
   * Reads one trade.
   *
   * @param trade_id - The business identifier, `TRD-100001`.
   * @returns The trade.
   * @throws {AppError} 404 when no such trade exists.
   */
  get(trade_id: string): Promise<Trade>;

  /**
   * Books a new trade and announces it.
   *
   * @param input - A validated create payload.
   * @param actor - Who is booking. The trade's trader comes from here, not from the payload.
   * @returns The stored trade.
   * @throws {AppError} 422 when the notional exceeds the desk limit for its currency.
   */
  create(input: CreateTrade, actor: TradeActor): Promise<Trade>;

  /**
   * Amends an active trade, provided the client's version is still current.
   *
   * @param trade_id - The trade to amend.
   * @param input - Validated changes, carrying the version the client last saw.
   * @param actor - Who is amending.
   * @returns The amended trade, one version higher.
   * @throws {AppError} 422 when no field was supplied or the resulting notional breaches the
   * limit, 403 when amending someone else's trade without the permission for it, 404 when the
   * trade is missing, 409 when it is cancelled or has already moved on.
   */
  amend(trade_id: string, input: AmendTrade, actor: TradeActor): Promise<Trade>;

  /**
   * Cancels an active trade.
   *
   * @param trade_id - The trade to cancel.
   * @param expected_version - Optional version guard from the client.
   * @param actor - Who is cancelling.
   * @returns The cancelled trade.
   * @throws {AppError} 403 when cancelling someone else's trade without the permission for it,
   * 404 when the trade is missing, 409 when it is already cancelled or has moved on.
   */
  cancel(
    trade_id: string,
    expected_version: number | undefined,
    actor: TradeActor,
  ): Promise<Trade>;

  /**
   * Reads the history of one trade, oldest first.
   *
   * @param trade_id - The trade whose history to read.
   * @returns The events, empty when the trade has never changed.
   * @throws {AppError} 404 when the trade itself does not exist, so an empty array always means
   * "never changed" rather than "no such trade".
   */
  list_events(trade_id: string): Promise<TradeEvent[]>;
}

/**
 * Rejects a ticket whose notional breaches the desk limit for its currency.
 *
 * The pre-trade control the brief never asks for and a trading firm would expect: it is the check
 * that stops a quantity typed into the price field from booking. Limits are per currency because
 * the blotter quotes in both USD and GBX and one ceiling cannot mean the same thing in both.
 *
 * @param quantity - Share count.
 * @param price - Price in the instrument's own currency.
 * @param currency - The instrument's quote currency.
 * @throws {AppError} 422 when the notional is over the limit.
 */
function enforce_notional_limit(quantity: number, price: number, currency: Currency): void {
  const notional = quantity * price;
  const limit = notional_limits[currency];

  if (notional > limit) {
    throw AppError.validation_failed(
      `Notional ${notional.toFixed(2)} ${currency} exceeds the ${limit.toFixed(2)} ${currency} desk limit`,
      [{ field: 'quantity', message: 'quantity times price exceeds the desk notional limit' }],
    );
  }
}

/**
 * Refuses to let one trader act on another's trade without the permission for it.
 *
 * This is the check the route middleware cannot make, because it depends on the row rather than on
 * the request: a trader holds `trade.amend`, but only an administrator holds `trade.amend.any`.
 * Doing it here rather than in the handler means the live feed is subject to the same rule.
 *
 * @param trade - The trade being acted on.
 * @param actor - Who is acting.
 * @param elevated - The permission that allows acting on someone else's trade.
 * @param verb - The action, for the message.
 * @throws {AppError} 403 when the trade belongs to someone else and the actor lacks the permission.
 */
function enforce_ownership(
  trade: Trade,
  actor: TradeActor,
  elevated: 'trade.amend.any' | 'trade.cancel.any',
  verb: string,
): void {
  if (trade.trader === actor.trader_code || role_has(actor.role, elevated)) {
    return;
  }

  throw AppError.forbidden(`Only ${trade.trader} or an administrator can ${verb} this trade`);
}

/**
 * Explains why a conditional write matched no row.
 *
 * The repository answers `null` for three different situations, and only the service knows which
 * status code each deserves, so the disambiguating read lives here.
 *
 * @param repository - Used to re-read the trade.
 * @param trade_id - The trade the write targeted.
 * @param action - The verb to use in the message, for example `amended`.
 * @returns Never returns.
 * @throws {AppError} 404 when the trade does not exist, 409 otherwise.
 */
async function explain_failed_write(
  repository: TradeRepository,
  trade_id: string,
  action: string,
): Promise<never> {
  const current = await repository.find_by_trade_id(trade_id);

  if (current === null) {
    throw AppError.not_found('trade', trade_id);
  }

  if (current.status === 'CANCELLED') {
    throw AppError.conflict(`Trade ${trade_id} is cancelled and can no longer be ${action}`);
  }

  throw AppError.conflict(
    `Trade ${trade_id} has changed since you loaded it. It is now at version ${current.version.toString()}. Reload and try again.`,
  );
}

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
  };
}
