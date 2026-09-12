import type {
  AmendableTrade,
  CreateTrade,
  Currency,
  Trade,
  TradeEvent,
  TradeEventSource,
  TradeQuery,
} from '@blotter/shared';

/** A page of trades, the total matching the same filters, and where the next page starts. */
export interface TradePage {
  /** The rows in the requested window, already in wire shape. */
  trades: Trade[];

  /** How many trades match the filters, ignoring the page window. */
  total: number;

  /** Cursor for the next page, or `null` when this was the last one. */
  next_cursor: string | null;
}

/**
 * A trade ready to store.
 *
 * `currency` is not on the create payload because it belongs to the instrument rather than the
 * ticket, so the service resolves it and hands the repository a complete row.
 */
export type NewTrade = CreateTrade & { currency: Currency };

/** The fields an amendment is allowed to change. */
export type TradeChanges = { [K in keyof AmendableTrade]?: AmendableTrade[K] | undefined };

/**
 * Who made a change and where it came in from, recorded on the event row.
 *
 * Carried as a parameter rather than read from ambient state, so the live feed and an HTTP request
 * are distinguishable in the audit trail without the repository knowing either exists.
 */
export interface TradeWriteContext {
  /** Who to attribute the change to. When omitted, the trade's own trader is used. */
  actor?: string;

  /** Which path the change arrived through. */
  source: TradeEventSource;
}

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
   * Reads a filtered, sorted, cursor-paged slice of the blotter.
   *
   * @param query - Already parsed and defaulted by `trade_query_schema`.
   * @returns The rows in the window, the unpaged total, and the next cursor.
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
   * @param input - A validated create payload with its currency resolved.
   * @returns The stored trade, including the identifiers the server assigned.
   */
  create(input: NewTrade): Promise<Trade>;

  /**
   * Applies an amendment to an `ACTIVE` trade whose version still matches, and records what moved
   * in the same transaction, so an amendment can never exist without its event row.
   *
   * @param trade_id - The trade to amend.
   * @param expected_version - The version the client last saw.
   * @param changes - The fields to overwrite.
   * @param context - Who made the change and where it came from.
   * @returns The amended trade, or `null` when nothing matched.
   */
  amend(
    trade_id: string,
    expected_version: number,
    changes: TradeChanges,
    context: TradeWriteContext,
  ): Promise<Trade | null>;

  /**
   * Moves an `ACTIVE` trade to `CANCELLED`, recording the transition in the same transaction.
   *
   * @param trade_id - The trade to cancel.
   * @param expected_version - Optional version guard. Omitted means cancel whatever is current.
   * @param context - Who cancelled it and where the request came from.
   * @returns The cancelled trade, or `null` when nothing matched.
   */
  cancel(
    trade_id: string,
    expected_version: number | undefined,
    context: TradeWriteContext,
  ): Promise<Trade | null>;

  /**
   * Reads the full history of one trade, oldest first.
   *
   * @param trade_id - The trade whose history to read.
   * @returns The events. Empty when the trade exists but has never changed.
   */
  find_events(trade_id: string): Promise<TradeEvent[]>;

  /**
   * Picks one `ACTIVE` trade at random, used by the live feed to choose something to amend or
   * cancel.
   *
   * @returns A trade, or `null` when the blotter holds no active trades.
   */
  find_random_active(): Promise<Trade | null>;
}
