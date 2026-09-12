import type {
  AmendTrade,
  CreateTrade,
  Trade,
  TradeAmendment,
  TradeList,
  TradeQuery,
} from '@blotter/shared';
import type { TradeBroadcaster } from '../interfaces/trade_broadcaster.js';
import type { TradeRepository } from '../interfaces/trade_repository.js';
import { AppError, error_codes } from '../lib/errors/app_error.js';

/**
 * The blotter's business rules: what a trade may become, and who is told about it.
 *
 * Everything that writes a trade goes through here, the HTTP routes and the live feed alike, so
 * the status transitions, the concurrency check and the broadcast exist in exactly one place.
 */
export interface TradeService {
  /**
   * Reads a filtered, sorted page of the blotter.
   *
   * @param query - Already parsed by `trade_query_schema`.
   * @returns The page, with the unpaged total and the window that produced it.
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
   * @returns The stored trade.
   */
  create(input: CreateTrade): Promise<Trade>;

  /**
   * Amends an active trade, provided the client's version is still current.
   *
   * @param trade_id - The trade to amend.
   * @param input - Validated changes, carrying the version the client last saw.
   * @returns The amended trade, one version higher.
   * @throws {AppError} 422 when no field was supplied, 404 when the trade is missing, 409 when the
   * trade is cancelled or has already moved on.
   */
  amend(trade_id: string, input: AmendTrade): Promise<Trade>;

  /**
   * Cancels an active trade.
   *
   * @param trade_id - The trade to cancel.
   * @param expected_version - Optional version guard from the client.
   * @returns The cancelled trade.
   * @throws {AppError} 404 when the trade is missing, 409 when it is already cancelled or has
   * moved on.
   */
  cancel(trade_id: string, expected_version?: number): Promise<Trade>;

  /**
   * Reads the amendment history of one trade, oldest first.
   *
   * @param trade_id - The trade whose history to read.
   * @returns The amendments, empty when the trade has never been amended.
   * @throws {AppError} 404 when the trade itself does not exist, so an empty array always means
   * "never amended" rather than "no such trade".
   */
  list_amendments(trade_id: string): Promise<TradeAmendment[]>;
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
        offset: query.offset,
      };
    },

    async get(trade_id: string): Promise<Trade> {
      return require_trade(trade_id);
    },

    async create(input: CreateTrade): Promise<Trade> {
      const trade = await repository.create(input);
      broadcaster.trade_created(trade);
      return trade;
    },

    async amend(trade_id: string, input: AmendTrade): Promise<Trade> {
      const { version, ...changes } = input;

      if (Object.keys(changes).length === 0) {
        throw new AppError(
          422,
          error_codes.validation_failed,
          'An amendment must change at least one field',
        );
      }

      // With no authentication, the trader on the payload is the closest thing to an actor. When
      // the amendment does not touch the trader, the repository attributes it to the trade's own.
      const amended = await repository.amend(trade_id, version, changes, changes.trader);

      if (amended === null) {
        return explain_failed_write(repository, trade_id, 'amended');
      }

      broadcaster.trade_amended(amended);
      return amended;
    },

    async cancel(trade_id: string, expected_version?: number): Promise<Trade> {
      const cancelled = await repository.cancel(trade_id, expected_version);

      if (cancelled === null) {
        return explain_failed_write(repository, trade_id, 'cancelled');
      }

      broadcaster.trade_cancelled(cancelled);
      return cancelled;
    },

    async list_amendments(trade_id: string): Promise<TradeAmendment[]> {
      await require_trade(trade_id);
      return repository.find_amendments(trade_id);
    },
  };
}
