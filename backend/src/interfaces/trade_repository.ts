import type { CreateTrade, Trade, TradeAmendment, TradeQuery } from '@blotter/shared';

/** A page of trades together with the total matching the same filters, before paging. */
export interface TradePage {
  /** The rows in the requested window, already in wire shape. */
  trades: Trade[];

  /** How many trades match the filters ignoring `limit` and `offset`. */
  total: number;
}

/** The fields an amendment is allowed to change. Identifiers, status and version are server-owned. */
export type TradeChanges = { [K in keyof CreateTrade]?: CreateTrade[K] | undefined };

/**
 * Persistence port for trades.
 *
 * The service depends on this rather than on `PrismaClient` so the business rules can be tested
 * without a database, and so a change of ORM stays inside `repositories/`.
 *
 * Implementations return `null` instead of throwing when a write matched no row. The caller owns
 * the decision of whether that was a missing trade or a stale version, because only it knows which
 * status code to answer with.
 */
export interface TradeRepository {
  /**
   * Reads a filtered, sorted, paged slice of the blotter.
   *
   * @param query - Already parsed and defaulted by `trade_query_schema`.
   * @returns The rows in the window and the unpaged total.
   */
  list(query: TradeQuery): Promise<TradePage>;

  /**
   * Reads one trade by its business identifier.
   *
   * @param trade_id - The `TRD-100001` form shown on the blotter.
   * @returns The trade, or `null` when no such trade exists.
   */
  find_by_trade_id(trade_id: string): Promise<Trade | null>;

  /**
   * Inserts a trade, assigning the business identifier from the database sequence.
   *
   * @param input - A validated create payload.
   * @returns The stored trade, including the identifiers the server assigned.
   */
  create(input: CreateTrade): Promise<Trade>;

  /**
   * Applies an amendment to an `ACTIVE` trade whose version still matches, and records what moved
   * in the same transaction as the update, so an amendment can never exist without its audit row.
   *
   * @param trade_id - The trade to amend.
   * @param expected_version - The version the client last saw.
   * @param changes - The fields to overwrite.
   * @param amended_by - Who to attribute the amendment to. When omitted, the trade's own trader is
   * used, because without authentication there is no better answer and a constant would record
   * nothing worth reading.
   * @returns The amended trade, or `null` when nothing matched.
   */
  amend(
    trade_id: string,
    expected_version: number,
    changes: TradeChanges,
    amended_by?: string,
  ): Promise<Trade | null>;

  /**
   * Moves an `ACTIVE` trade to `CANCELLED`.
   *
   * @param trade_id - The trade to cancel.
   * @param expected_version - Optional version guard. Omitted means cancel whatever is current.
   * @returns The cancelled trade, or `null` when nothing matched.
   */
  cancel(trade_id: string, expected_version?: number): Promise<Trade | null>;

  /**
   * Reads the amendment history of one trade, oldest first.
   *
   * @param trade_id - The trade whose history to read.
   * @returns The amendments. Empty when the trade exists but has never been amended.
   */
  find_amendments(trade_id: string): Promise<TradeAmendment[]>;

  /**
   * Picks one `ACTIVE` trade at random, used by the live feed to choose something to amend or
   * cancel.
   *
   * @returns A trade, or `null` when the blotter holds no active trades.
   */
  find_random_active(): Promise<Trade | null>;
}
